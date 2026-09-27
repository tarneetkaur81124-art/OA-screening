const { z } = require('zod');

const uuid = z.string().uuid();

const patientSchema = z.object({
  id: uuid, // client-generated, so retries are idempotent
  local_id: z.string().optional().nullable(),
  name: z.string().min(1),
  age: z.number().int().positive().optional().nullable(),
  gender: z.enum(['male', 'female', 'other']).optional().nullable(),
  phone: z.string().optional().nullable(),
  village: z.string().optional().nullable(),
  block: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  device_created_at: z.string().datetime().optional().nullable(),
});

// KOOS (Knee injury and Osteoarthritis Outcome Score) subscales — each stored as the
// raw sum of its items (every item scored 0-4), matching the official KOOS scoring manual.
const symptomAssessmentSchema = z.object({
  id: uuid,
  patient_id: uuid,
  pain_scale: z.number().int().min(0).max(10).optional().nullable(),
  stiffness_duration_min: z.number().int().min(0).optional().nullable(),
  swelling: z.boolean().optional(),
  family_history: z.boolean().optional(),
  joints_affected: z.array(z.string()).optional(),
  koos_pain_score: z.number().min(0).max(36),        // Pain — 9 items
  koos_symptoms_score: z.number().min(0).max(28),     // Symptoms/stiffness — 7 items
  koos_adl_score: z.number().min(0).max(68),          // Function in daily living — 17 items
  koos_sport_score: z.number().min(0).max(20),        // Function in sport/recreation — 5 items
  koos_qol_score: z.number().min(0).max(16),          // Quality of life — 4 items
  raw_answers: z.record(z.any()).optional(),
  device_created_at: z.string().datetime().optional().nullable(),
});

const sensorSessionSchema = z.object({
  id: uuid,
  patient_id: uuid,
  session_type: z.enum(['imu', 'vision']),
  device_id: z.string().optional().nullable(),
  started_at: z.string().datetime().optional().nullable(),
  ended_at: z.string().datetime().optional().nullable(),
  raw_data: z.any().optional(),
  storage_url: z.string().url().optional().nullable(),
  gait_features: z
    .object({
      stride_time_variability: z.number().optional(),
      knee_rom_deg: z.number().optional(),
      cadence_asymmetry: z.number().optional(),
      stance_time_ratio: z.number().optional(),
      // The exact feature vector the trained model expects (25 MediaPipe
      // features for a vision session, or the IMU signal-stat/stride-rhythm
      // features for an imu session) — computed by the shared
      // feature-engineering module, not reconstructed here.
      feature_vector: z.record(z.any()).optional(),
      extra: z.record(z.any()).optional(),
    })
    .optional(),
});

// X-ray study: the app/health-worker device uploads the radiograph to storage
// first (e.g. Supabase Storage) and registers it here with the resulting URL —
// same pattern as sensor_sessions.storage_url, so the 5MB JSON body limit is
// never a concern for image bytes.
const xrayStudySchema = z.object({
  id: uuid,
  patient_id: uuid,
  knee_side: z.enum(['left', 'right', 'both', 'unspecified']).optional(),
  image_storage_url: z.string().url(),
  device_created_at: z.string().datetime().optional().nullable(),
});

const referralUpdateSchema = z.object({
  status: z.enum(['pending', 'completed', 'declined', 'no_show']),
  notes: z.string().optional().nullable(),
});

/** Batch sync payload: arrays of records per table, each idempotent on client-generated id. */
const syncBatchSchema = z.object({
  patients: z.array(patientSchema).optional().default([]),
  symptom_assessments: z.array(symptomAssessmentSchema).optional().default([]),
  sensor_sessions: z.array(sensorSessionSchema).optional().default([]),
});

module.exports = {
  patientSchema,
  symptomAssessmentSchema,
  sensorSessionSchema,
  xrayStudySchema,
  referralUpdateSchema,
  syncBatchSchema,
};
