const { pool } = require('../config/db');
const { sensorSessionSchema } = require('../utils/validators');

async function createSensorSession(req, res) {
  const s = sensorSessionSchema.parse(req.body);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `insert into sensor_sessions
         (id, patient_id, session_type, device_id, started_at, ended_at, raw_data, storage_url, synced_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, now())
       on conflict (id) do nothing
       returning *`,
      [
        s.id,
        s.patient_id,
        s.session_type,
        s.device_id || null,
        s.started_at || null,
        s.ended_at || null,
        s.raw_data ? JSON.stringify(s.raw_data) : null,
        s.storage_url || null,
      ]
    );

    let gaitFeatureRow = null;
    if (rows.length > 0 && s.gait_features) {
      const gf = s.gait_features;
      const inserted = await client.query(
        `insert into gait_features
           (id, sensor_session_id, stride_time_variability, knee_rom_deg, cadence_asymmetry, stance_time_ratio, feature_vector, extra)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
         returning *`,
        [
          s.id,
          gf.stride_time_variability ?? null,
          gf.knee_rom_deg ?? null,
          gf.cadence_asymmetry ?? null,
          gf.stance_time_ratio ?? null,
          gf.feature_vector ? JSON.stringify(gf.feature_vector) : null,
          gf.extra ? JSON.stringify(gf.extra) : null,
        ]
      );
      gaitFeatureRow = inserted.rows[0];
    }

    await client.query('COMMIT');

    if (rows.length === 0) {
      const existing = await pool.query('select * from sensor_sessions where id = $1', [s.id]);
      return res.status(200).json(existing.rows[0]);
    }

    res.status(201).json({ ...rows[0], gait_features: gaitFeatureRow });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listSessionsForPatient(req, res) {
  const patientId = req.params.patientId || req.query.patient_id;
  if (!patientId) return res.status(400).json({ error: 'patient_id is required (path param or ?patient_id=)' });

  const { rows } = await pool.query(
    `select ss.*, gf.stride_time_variability, gf.knee_rom_deg, gf.cadence_asymmetry, gf.stance_time_ratio, gf.feature_vector
     from sensor_sessions ss
     left join gait_features gf on gf.sensor_session_id = ss.id
     where ss.patient_id = $1
     order by ss.created_at desc`,
    [patientId]
  );
  res.json(rows);
}

module.exports = { createSensorSession, listSessionsForPatient };
