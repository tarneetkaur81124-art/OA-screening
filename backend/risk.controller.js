const { pool } = require('../config/db');
const { computeRiskAssessment } = require('../services/riskEngine.service');

/**
 * POST /api/patients/:patientId/risk-assessment
 * Body (all optional): { symptom_assessment_id, sensor_session_id, imu_session_id, xray_study_id }
 * `sensor_session_id` pins the VISION session used for the gait model;
 * `imu_session_id` pins the IMU session used for the wearable-sensor model.
 * Anything not provided defaults to the patient's most recent record of that kind.
 */
async function runRiskAssessment(req, res) {
  const { patientId } = req.params;
  let { symptom_assessment_id, sensor_session_id, imu_session_id, xray_study_id } = req.body || {};

  const patientCheck = await pool.query('select id from patients where id = $1', [patientId]);
  if (patientCheck.rows.length === 0) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  let symptomAssessment = null;
  if (symptom_assessment_id) {
    const r = await pool.query('select * from symptom_assessments where id = $1 and patient_id = $2', [
      symptom_assessment_id,
      patientId,
    ]);
    symptomAssessment = r.rows[0] || null;
  } else {
    const r = await pool.query(
      'select * from symptom_assessments where patient_id = $1 order by created_at desc limit 1',
      [patientId]
    );
    symptomAssessment = r.rows[0] || null;
  }

  // Vision-based gait session (feeds the gait/MediaPipe model)
  let gaitFeatures = null;
  let resolvedGaitSessionId = sensor_session_id || null;
  if (sensor_session_id) {
    const r = await pool.query(
      `select gf.* from gait_features gf
       join sensor_sessions ss on ss.id = gf.sensor_session_id
       where gf.sensor_session_id = $1 and ss.session_type = 'vision' and ss.patient_id = $2`,
      [sensor_session_id, patientId]
    );
    gaitFeatures = r.rows[0] || null;
  } else {
    const r = await pool.query(
      `select gf.* from gait_features gf
       join sensor_sessions ss on ss.id = gf.sensor_session_id
       where ss.patient_id = $1 and ss.session_type = 'vision'
       order by gf.created_at desc limit 1`,
      [patientId]
    );
    gaitFeatures = r.rows[0] || null;
    resolvedGaitSessionId = gaitFeatures ? gaitFeatures.sensor_session_id : null;
  }

  // IMU/wearable-sensor session (feeds the IMU model)
  let imuFeatures = null;
  let resolvedImuSessionId = imu_session_id || null;
  if (imu_session_id) {
    const r = await pool.query(
      `select gf.* from gait_features gf
       join sensor_sessions ss on ss.id = gf.sensor_session_id
       where gf.sensor_session_id = $1 and ss.session_type = 'imu' and ss.patient_id = $2`,
      [imu_session_id, patientId]
    );
    imuFeatures = r.rows[0] || null;
  } else {
    const r = await pool.query(
      `select gf.* from gait_features gf
       join sensor_sessions ss on ss.id = gf.sensor_session_id
       where ss.patient_id = $1 and ss.session_type = 'imu'
       order by gf.created_at desc limit 1`,
      [patientId]
    );
    imuFeatures = r.rows[0] || null;
    resolvedImuSessionId = imuFeatures ? imuFeatures.sensor_session_id : null;
  }

  // X-ray study (already scored by the CNN at upload time — see xray.controller.js)
  let xrayStudy = null;
  let resolvedXrayStudyId = xray_study_id || null;
  if (xray_study_id) {
    const r = await pool.query('select * from xray_studies where id = $1 and patient_id = $2', [
      xray_study_id,
      patientId,
    ]);
    xrayStudy = r.rows[0] || null;
  } else {
    const r = await pool.query(
      'select * from xray_studies where patient_id = $1 order by created_at desc limit 1',
      [patientId]
    );
    xrayStudy = r.rows[0] || null;
    resolvedXrayStudyId = xrayStudy ? xrayStudy.id : null;
  }

  const result = await computeRiskAssessment(symptomAssessment, gaitFeatures, imuFeatures, xrayStudy);

  const { rows } = await pool.query(
    `insert into risk_assessments
       (patient_id, symptom_assessment_id, sensor_session_id, imu_session_id, xray_study_id,
        symptom_score, xray_score, gait_score, imu_score, composite_score, risk_tier, recommendation,
        model_version, score_breakdown)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     returning *`,
    [
      patientId,
      symptomAssessment ? symptomAssessment.id : null,
      resolvedGaitSessionId,
      resolvedImuSessionId,
      resolvedXrayStudyId,
      result.symptom_score,
      result.xray_score,
      result.gait_score,
      result.imu_score,
      result.composite_score,
      result.risk_tier,
      result.recommendation,
      result.model_version,
      JSON.stringify(result.score_breakdown),
    ]
  );

  // High-risk auto-creates a pending referral so nothing falls through the cracks
  if (result.risk_tier === 'high') {
    await pool.query(
      `insert into referrals (patient_id, risk_assessment_id, status, notes)
       values ($1, $2, 'pending', 'Auto-created: high OA risk score')`,
      [patientId, rows[0].id]
    );
  }

  res.status(201).json(rows[0]);
}

async function getLatestRiskForPatient(req, res) {
  const { rows } = await pool.query(
    'select * from risk_assessments where patient_id = $1 order by created_at desc limit 1',
    [req.params.patientId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'No risk assessment yet for this patient' });
  res.json(rows[0]);
}

module.exports = { runRiskAssessment, getLatestRiskForPatient };
