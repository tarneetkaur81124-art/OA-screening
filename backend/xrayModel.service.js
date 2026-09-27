/**
 * X-ray CNN (EfficientNetB0) model service
 * =========================================
 * Unlike the tabular gait/IMU models, there is no clinically sound
 * rule-based fallback for a radiograph reading — you can't heuristically
 * guess a KL grade the way you can approximate a gait score from stride
 * variability. So if ML_XRAY_MODEL_ENDPOINT is unset or the call fails,
 * the study is simply stored unscored (model_score = null) and excluded
 * from the risk fusion until it can be re-scored, rather than faking a number.
 *
 * Inference runs ONCE, when the study is created (src/controllers/xray.controller.js),
 * not on every risk-assessment request — a radiograph doesn't change between
 * requests, so there's no reason to re-run a CNN forward pass each time.
 *
 * Expected model service contract:
 *   POST { image_url: "<image_storage_url>" }
 *   -> { kl_grade_probabilities: { kl0, kl1, kl2, kl3, kl4 }, model_version? }
 * The 5 probabilities should come from the exact same preprocessing pipeline
 * (aspect-ratio-preserving resize + normalization) used in training —
 * that has to be byte-for-byte identical or the accuracy numbers won't hold.
 */

const KL_KEYS = ['kl0', 'kl1', 'kl2', 'kl3', 'kl4'];

/** Finalized decision rule: OA-present if P(KL2) + P(KL3) + P(KL4) > 0.5. */
function oaProbabilityFromGrades(probs) {
  return probs.kl2 + probs.kl3 + probs.kl4;
}

/**
 * Calls the X-ray model service for one image. Returns null on any failure
 * (unset endpoint, timeout, network error, malformed response) so the caller
 * can store the study unscored rather than guessing.
 */
async function scoreXrayStudy(imageUrl) {
  const endpoint = process.env.ML_XRAY_MODEL_ENDPOINT;
  if (!endpoint || !imageUrl) return null;

  // CNN inference is slower than the tabular models — give it more room by default.
  const timeoutMs = Number(process.env.ML_XRAY_MODEL_TIMEOUT_MS || 15000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = await res.json();
    const probs = data.kl_grade_probabilities;
    if (!probs || !KL_KEYS.every((k) => typeof probs[k] === 'number')) return null;

    const oaProb = oaProbabilityFromGrades(probs);
    return {
      kl_grade_probabilities: probs,
      oa_present: oaProb > 0.5,
      model_score: Math.round(oaProb * 1000) / 10, // 0-100, risk-style score for fusion
      model_version: data.model_version || 'xray-cnn-v1',
    };
  } catch (_err) {
    return null; // network error, timeout, bad JSON -> caller stores the study unscored
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { scoreXrayStudy };
