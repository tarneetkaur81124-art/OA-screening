const { pool } = require('../config/db');
const { xrayStudySchema } = require('../utils/validators');
const { scoreXrayStudy } = require('../services/xrayModel.service');

/**
 * POST /api/patients/:patientId/xray-studies (or /api/xray-studies with patient_id in body)
 * Body: { id, patient_id, knee_side?, image_storage_url, device_created_at? }
 * The image itself is uploaded to storage by the client beforehand (same pattern
 * as sensor_sessions.storage_url) — this endpoint registers the study and runs
 * the CNN once, caching kl_grade_probabilities/oa_present/model_score on the row.
 */
async function createXrayStudy(req, res) {
  const s = xrayStudySchema.parse(req.body);

  // Run inference now, at upload time — see xrayModel.service.js for why this
  // isn't re-run on every risk-assessment request. A failed/unset model call
  // returns null; the study is stored unscored rather than guessed.
  const modelResult = await scoreXrayStudy(s.image_storage_url);

  const { rows } = await pool.query(
    `insert into xray_studies
       (id, patient_id, knee_side, image_storage_url, kl_grade_probabilities, oa_present, model_score, model_version, device_created_at, synced_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     on conflict (id) do nothing
     returning *`,
    [
      s.id,
      s.patient_id,
      s.knee_side || 'unspecified',
      s.image_storage_url,
      modelResult ? JSON.stringify(modelResult.kl_grade_probabilities) : null,
      modelResult ? modelResult.oa_present : null,
      modelResult ? modelResult.model_score : null,
      modelResult ? modelResult.model_version : 'unavailable',
      s.device_created_at || null,
    ]
  );

  if (rows.length === 0) {
    const existing = await pool.query('select * from xray_studies where id = $1', [s.id]);
    return res.status(200).json(existing.rows[0]);
  }

  res.status(201).json(rows[0]);
}

async function listXrayStudiesForPatient(req, res) {
  const patientId = req.params.patientId || req.query.patient_id;
  if (!patientId) return res.status(400).json({ error: 'patient_id is required (path param or ?patient_id=)' });

  const { rows } = await pool.query(
    'select * from xray_studies where patient_id = $1 order by created_at desc',
    [patientId]
  );
  res.json(rows);
}

module.exports = { createXrayStudy, listXrayStudiesForPatient };
