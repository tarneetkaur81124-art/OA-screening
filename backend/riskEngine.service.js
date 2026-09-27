/**
 * Risk Scoring Engine
 * ===================
 * Produces a 0-100 composite OA risk score by fusing up to FOUR signals:
 *   1. Symptom data (digitized KOOS questionnaire)
 *   2. X-ray score (EfficientNetB0 KL-grade CNN), already scored at upload
 *      time on the xray_studies row — see src/services/xrayModel.service.js
 *   3. Gait score (vision/MediaPipe pose model), from a 'vision' sensor session
 *   4. IMU score (wearable-sensor model), from an 'imu' sensor session
 *
 * Any subset of these may be missing for a given patient/visit — weights are
 * renormalized across whichever signals are actually present, rather than
 * requiring all four.
 *
 * Design notes:
 * - This is a *screening/triage* tool, not a diagnostic one. Recommendations
 *   are phrased as "refer" / "monitor", never as a diagnosis.
 * - The gait and IMU models are each exposed over HTTP (ML_GAIT_MODEL_ENDPOINT /
 *   ML_IMU_MODEL_ENDPOINT) — set either to point this engine at your team's
 *   trained model, with automatic fallback to a transparent rule-based score
 *   if the call fails, times out, or the endpoint isn't configured, so a
 *   flaky model service never blocks a health worker in the field.
 * - The X-ray CNN has no such rule-based fallback (see xrayModel.service.js)
 *   — an unscored study is simply excluded from the fusion.
 */

// KOOS subscale max raw scores (every item is scored 0-4), per the official KOOS manual.
const KOOS_MAX = {
  pain: 36,     // 9 items
  symptoms: 28, // 7 items
  adl: 68,      // 17 items (function in daily living)
  sport: 20,    // 5 items (function in sport/recreation)
  qol: 16,      // 4 items (quality of life)
};

// Base fusion weights, renormalized below over whichever signals are present.
const SIGNAL_WEIGHTS = {
  symptom: 0.3,
  xray: 0.35,
  gait: 0.2,
  imu: 0.15,
};

/**
 * Normalizes raw KOOS subscale totals into a single 0-100 symptom score.
 * Note: KOOS itself is scored so 100 = no symptoms / best knee health, the opposite
 * direction of WOMAC. We invert each subscale here so the output stays a "risk-style"
 * score (higher = more symptom burden) that the rest of the engine already expects.
 * There's no single official KOOS composite, so this averages the five subscales
 * equally — adjust the weights below if your clinical team wants a different mix.
 */
function computeSymptomScore({ koos_pain_score, koos_symptoms_score, koos_adl_score, koos_sport_score, koos_qol_score }) {
  const painBurden = 100 - (clamp(koos_pain_score, 0, KOOS_MAX.pain) / KOOS_MAX.pain) * 100;
  const symptomsBurden = 100 - (clamp(koos_symptoms_score, 0, KOOS_MAX.symptoms) / KOOS_MAX.symptoms) * 100;
  const adlBurden = 100 - (clamp(koos_adl_score, 0, KOOS_MAX.adl) / KOOS_MAX.adl) * 100;
  const sportBurden = 100 - (clamp(koos_sport_score, 0, KOOS_MAX.sport) / KOOS_MAX.sport) * 100;
  const qolBurden = 100 - (clamp(koos_qol_score, 0, KOOS_MAX.qol) / KOOS_MAX.qol) * 100;

  const composite = (painBurden + symptomsBurden + adlBurden + sportBurden + qolBurden) / 5;
  return round1(composite);
}

/** Rule-based gait/IMU score fallback (used if no ML endpoint is configured, or it fails).
 *  Shared by both signals since they use the same 4 summary columns. */
function computeGaitScoreRuleBased(features) {
  if (!features) return null;

  const {
    stride_time_variability = 0, // higher = worse, typical clinical cut-off ~ >3-4%
    knee_rom_deg = 140,          // lower = worse, healthy knee ROM ~130-150 deg walking
    cadence_asymmetry = 0,       // 0-1, higher = worse
    stance_time_ratio = 0.6,     // ~0.6 is typical single-limb stance ratio; deviation = worse
  } = features;

  const strideRisk = clamp(stride_time_variability / 6, 0, 1); // >6% variability -> max risk
  const romRisk = clamp((150 - knee_rom_deg) / 60, 0, 1);      // ROM below ~90deg -> max risk
  const asymmetryRisk = clamp(cadence_asymmetry, 0, 1);
  const stanceRisk = clamp(Math.abs(stance_time_ratio - 0.6) / 0.25, 0, 1);

  const composite =
    strideRisk * 0.3 + romRisk * 0.35 + asymmetryRisk * 0.2 + stanceRisk * 0.15;

  return round1(composite * 100);
}

/**
 * Calls a trained tabular model (gait or IMU) over HTTP. Returns null on any
 * failure so callers fall back gracefully to the rule-based score.
 * Sends the full feature row, including `feature_vector` (the exact engineered
 * features the model was trained on) when present, plus the legacy summary
 * columns for models that only need those.
 */
async function callTabularModel(endpoint, timeoutMs, features) {
  if (!endpoint || !features) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Accept either key: `risk_score` (preferred, generic) or the older
    // `gait_risk_score` (back-compat with a single-model deployment).
    const score = typeof data.risk_score === 'number' ? data.risk_score : data.gait_risk_score;
    if (typeof score !== 'number') return null;
    return round1(clamp(score, 0, 100));
  } catch (_err) {
    return null; // network error, timeout, bad JSON -> fall back to rule-based
  } finally {
    clearTimeout(timer);
  }
}

async function computeGaitScoreFromModel(features) {
  // Falls back to the legacy single-model env var so existing deployments
  // that only ever had one model endpoint keep working unchanged.
  const endpoint = process.env.ML_GAIT_MODEL_ENDPOINT || process.env.ML_MODEL_ENDPOINT;
  const timeoutMs = Number(process.env.ML_GAIT_MODEL_TIMEOUT_MS || process.env.ML_MODEL_TIMEOUT_MS || 3000);
  return callTabularModel(endpoint, timeoutMs, features);
}

async function computeImuScoreFromModel(features) {
  const endpoint = process.env.ML_IMU_MODEL_ENDPOINT;
  const timeoutMs = Number(process.env.ML_IMU_MODEL_TIMEOUT_MS || 3000);
  return callTabularModel(endpoint, timeoutMs, features);
}

function tierAndRecommendation(compositeScore) {
  if (compositeScore >= 66) {
    return {
      risk_tier: 'high',
      recommendation:
        'Refer to orthopaedician for clinical evaluation. Priority follow-up recommended.',
    };
  }
  if (compositeScore >= 33) {
    return {
      risk_tier: 'moderate',
      recommendation:
        'Monitor with lifestyle advice (weight management, low-impact exercise). Re-screen in 3-6 months.',
    };
  }
  return {
    risk_tier: 'low',
    recommendation: 'No referral needed at this time. Routine re-screening at next camp.',
  };
}

/**
 * Main entry point: computes a full risk assessment from whichever signals
 * are available.
 * @param {object} symptomAssessment - row from symptom_assessments (may be null)
 * @param {object} gaitFeatures - gait_features row from the patient's latest 'vision' sensor session (may be null)
 * @param {object} imuFeatures - gait_features row from the patient's latest 'imu' sensor session (may be null)
 * @param {object} xrayStudy - row from xray_studies, already scored at upload time (may be null)
 */
async function computeRiskAssessment(symptomAssessment, gaitFeatures, imuFeatures, xrayStudy) {
  const symptomScore = symptomAssessment ? computeSymptomScore(symptomAssessment) : null;

  let gaitScore = null;
  let gaitModelVersion = null;
  if (gaitFeatures) {
    gaitScore = await computeGaitScoreFromModel(gaitFeatures);
    gaitModelVersion = gaitScore !== null ? 'ml-model-v1' : 'rule-based-v1';
    if (gaitScore === null) gaitScore = computeGaitScoreRuleBased(gaitFeatures);
  }

  let imuScore = null;
  let imuModelVersion = null;
  if (imuFeatures) {
    imuScore = await computeImuScoreFromModel(imuFeatures);
    imuModelVersion = imuScore !== null ? 'ml-model-v1' : 'rule-based-v1';
    if (imuScore === null) imuScore = computeGaitScoreRuleBased(imuFeatures);
  }

  // The X-ray CNN already ran at upload time (xrayModel.service.js) — there's
  // no live call here, and no rule-based substitute for a radiograph reading.
  const xrayScore = xrayStudy && typeof xrayStudy.model_score === 'number' ? Number(xrayStudy.model_score) : null;
  const xrayModelVersion = xrayStudy ? xrayStudy.model_version : null;

  const present = [
    { key: 'symptom', score: symptomScore, weight: SIGNAL_WEIGHTS.symptom },
    { key: 'xray', score: xrayScore, weight: SIGNAL_WEIGHTS.xray, model_version: xrayModelVersion },
    { key: 'gait', score: gaitScore, weight: SIGNAL_WEIGHTS.gait, model_version: gaitModelVersion },
    { key: 'imu', score: imuScore, weight: SIGNAL_WEIGHTS.imu, model_version: imuModelVersion },
  ].filter((s) => s.score !== null);

  if (present.length === 0) {
    throw Object.assign(new Error('Cannot compute risk with no symptom, x-ray, gait, or IMU data'), { status: 400 });
  }

  // Renormalize weights over whichever signals are actually present, so e.g.
  // a patient with only a symptom form filled in still gets a sensible 0-100 score.
  const weightSum = present.reduce((sum, s) => sum + s.weight, 0);
  const composite = round1(present.reduce((sum, s) => sum + s.score * s.weight, 0) / weightSum);

  const { risk_tier, recommendation } = tierAndRecommendation(composite);

  const score_breakdown = {};
  for (const s of present) {
    score_breakdown[s.key] = { score: s.score, weight: round1(s.weight / weightSum), model_version: s.model_version || null };
  }

  return {
    symptom_score: symptomScore,
    xray_score: xrayScore,
    gait_score: gaitScore,
    imu_score: imuScore,
    composite_score: composite,
    risk_tier,
    recommendation,
    model_version: 'fusion-v2',
    score_breakdown,
  };
}

function clamp(value, min, max) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

module.exports = { computeRiskAssessment, computeSymptomScore, computeGaitScoreRuleBased };
