-- ============================================================
-- Osteoarthritis Early Screening System — Database Schema
-- Target: Supabase Postgres (works on plain Postgres too,
-- just skip the "auth.users" foreign key + RLS sections)
-- ============================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ------------------------------------------------------------
-- 1. Health workers (ASHA/ANM staff + district officers)
-- ------------------------------------------------------------
create table if not exists health_workers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete cascade, -- Supabase auth link
  name text not null,
  phone text unique,
  role text not null default 'worker' check (role in ('worker', 'officer', 'admin')),
  village text,
  block text,
  district text,
  language_pref text default 'en', -- en, as, bn, ne, kha, mni, lus, brx...
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Patients
-- Note: id is TEXT (client-generated UUID from the app, offline-safe)
-- rather than server-generated, so retries never create duplicates.
--
-- A patient row can come from either flow:
--   - a health worker registers them in the field (health_worker_id set, auth_user_id null
--     until/unless the patient later signs up and gets linked), or
--   - the patient signs up and logs in themselves via Supabase Auth (auth_user_id set,
--     health_worker_id null since no worker registered them).
-- ------------------------------------------------------------
create table if not exists patients (
  id uuid primary key, -- generated client-side (crypto.randomUUID())
  auth_user_id uuid unique references auth.users(id) on delete set null, -- set when the patient has their own login
  health_worker_id uuid references health_workers(id), -- worker who registered them, if any
  local_id text, -- optional Aadhaar-linked or camp-local ID
  name text not null,
  age int check (age > 0 and age < 130),
  gender text check (gender in ('male', 'female', 'other')),
  phone text,
  village text,
  block text,
  district text,
  created_at timestamptz not null default now(),
  device_created_at timestamptz, -- when it was actually created offline, on the device
  synced_at timestamptz
);

create index if not exists idx_patients_health_worker on patients(health_worker_id);
create index if not exists idx_patients_district on patients(district);
create index if not exists idx_patients_auth_user on patients(auth_user_id);

-- ------------------------------------------------------------
-- 3. Symptom assessments (digitized KOOS questionnaire)
-- KOOS = Knee injury and Osteoarthritis Outcome Score. Each subscale below stores
-- the raw sum of its items (every item scored 0-4), per the official KOOS scoring manual:
--   pain 0-36 (9 items), symptoms 0-28 (7 items), adl 0-68 (17 items),
--   sport/rec 0-20 (5 items), qol 0-16 (4 items).
-- ------------------------------------------------------------
create table if not exists symptom_assessments (
  id uuid primary key,
  patient_id uuid not null references patients(id) on delete cascade,
  pain_scale int check (pain_scale between 0 and 10),
  stiffness_duration_min int,
  swelling boolean default false,
  family_history boolean default false,
  joints_affected text[], -- e.g. {'knee_left','hip_right'}
  koos_pain_score numeric check (koos_pain_score between 0 and 36),
  koos_symptoms_score numeric check (koos_symptoms_score between 0 and 28),
  koos_adl_score numeric check (koos_adl_score between 0 and 68),
  koos_sport_score numeric check (koos_sport_score between 0 and 20),
  koos_qol_score numeric check (koos_qol_score between 0 and 16),
  raw_answers jsonb,              -- full questionnaire payload, for audit/re-scoring
  created_at timestamptz not null default now(),
  device_created_at timestamptz,
  synced_at timestamptz
);

create index if not exists idx_symptoms_patient on symptom_assessments(patient_id);

-- ------------------------------------------------------------
-- 4. Sensor sessions (IMU strap-on kit OR phone-camera pose video)
-- ------------------------------------------------------------
create table if not exists sensor_sessions (
  id uuid primary key,
  patient_id uuid not null references patients(id) on delete cascade,
  session_type text not null check (session_type in ('imu', 'vision')),
  device_id text, -- ESP32 MAC / phone identifier
  started_at timestamptz,
  ended_at timestamptz,
  raw_data jsonb, -- raw IMU stream or pose-landmark stream (small sessions);
                  -- for large captures store a storage_url instead
  storage_url text,
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

create index if not exists idx_sensor_sessions_patient on sensor_sessions(patient_id);

-- ------------------------------------------------------------
-- 5. Gait features (engineered from a sensor session, feeds the model)
-- One row per sensor_session — session_type on the parent row tells you
-- whether this feeds the vision/MediaPipe gait model or the wearable IMU
-- model; both currently share this table since the 4 summary columns below
-- (used by the rule-based fallback) apply to either modality.
-- ------------------------------------------------------------
create table if not exists gait_features (
  id uuid primary key,
  sensor_session_id uuid not null references sensor_sessions(id) on delete cascade,
  stride_time_variability numeric,
  knee_rom_deg numeric,       -- range of motion, degrees
  cadence_asymmetry numeric,  -- 0-1, left/right imbalance
  stance_time_ratio numeric,
  -- The exact feature vector the trained model expects (the 25 engineered
  -- MediaPipe features for a 'vision' session, or the whole-trial signal
  -- stats + stride-rhythm features for an 'imu' session). Computed by the
  -- shared feature-engineering module (e.g. gait_features.py), NOT
  -- hand-duplicated here, so training and inference never drift apart.
  feature_vector jsonb,
  extra jsonb,
  created_at timestamptz not null default now()
);

alter table gait_features add column if not exists feature_vector jsonb;

-- ------------------------------------------------------------
-- 6. X-ray studies (EfficientNetB0 5-class KL-grade classifier)
-- One row per uploaded radiograph. Unlike the tabular gait/IMU models,
-- there's no sound rule-based fallback for a radiograph reading, so
-- inference runs once at upload time (see src/services/xrayModel.service.js)
-- and the result is cached here — risk-assessment requests just read it.
-- ------------------------------------------------------------
create table if not exists xray_studies (
  id uuid primary key,
  patient_id uuid not null references patients(id) on delete cascade,
  knee_side text not null default 'unspecified' check (knee_side in ('left', 'right', 'both', 'unspecified')),
  image_storage_url text not null, -- uploaded radiograph (e.g. Supabase Storage URL)
  kl_grade_probabilities jsonb,    -- {kl0,kl1,kl2,kl3,kl4} softmax from the CNN
  oa_present boolean,              -- P(KL2)+P(KL3)+P(KL4) > 0.5, the finalized decision rule
  model_score numeric,             -- 0-100, risk-style score derived from oa probability, for fusion
  model_version text,              -- null/'unavailable' if the model call failed at upload time
  created_at timestamptz not null default now(),
  device_created_at timestamptz,
  synced_at timestamptz
);

create index if not exists idx_xray_patient on xray_studies(patient_id);

-- ------------------------------------------------------------
-- 7. Risk assessments (the composite output of the scoring engine)
-- Now a 4-signal fusion: symptom (KOOS), x-ray (CNN), gait (vision/MediaPipe
-- model), and imu (wearable-sensor model) — any subset of which may be
-- present for a given patient at scoring time.
-- ------------------------------------------------------------
create table if not exists risk_assessments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  symptom_assessment_id uuid references symptom_assessments(id),
  sensor_session_id uuid references sensor_sessions(id), -- the VISION session used for gait_score
  imu_session_id uuid references sensor_sessions(id),    -- the IMU session used for imu_score
  xray_study_id uuid references xray_studies(id),
  symptom_score numeric,     -- 0-100, normalized KOOS composite (higher = more symptom burden)
  xray_score numeric,        -- 0-100, from the X-ray CNN (nullable if no study / model unavailable)
  gait_score numeric,        -- 0-100, from the vision/MediaPipe gait model (nullable if no session)
  imu_score numeric,         -- 0-100, from the wearable IMU model (nullable if no session)
  composite_score numeric not null,  -- 0-100, final blended score
  risk_tier text not null check (risk_tier in ('low', 'moderate', 'high')),
  recommendation text not null, -- e.g. "Monitor / lifestyle advice" or "Refer to orthopaedician"
  model_version text default 'rule-based-v1', -- fusion formula version, e.g. 'fusion-v2'
  score_breakdown jsonb,      -- per-signal {score, weight, model_version} used for this composite
  created_at timestamptz not null default now()
);

alter table risk_assessments add column if not exists imu_session_id uuid references sensor_sessions(id);
alter table risk_assessments add column if not exists xray_study_id uuid references xray_studies(id);
alter table risk_assessments add column if not exists xray_score numeric;
alter table risk_assessments add column if not exists imu_score numeric;
alter table risk_assessments add column if not exists score_breakdown jsonb;

create index if not exists idx_risk_patient on risk_assessments(patient_id);
create index if not exists idx_risk_tier on risk_assessments(risk_tier);

-- ------------------------------------------------------------
-- 7. Referrals (tracking what happens after a High/Moderate flag)
-- ------------------------------------------------------------
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  risk_assessment_id uuid references risk_assessments(id),
  referred_to text, -- facility/doctor name
  status text not null default 'pending' check (status in ('pending', 'completed', 'declined', 'no_show')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_referrals_patient on referrals(patient_id);
create index if not exists idx_referrals_status on referrals(status);

-- ------------------------------------------------------------
-- 8. Sync log (audit trail for the offline-first sync queue)
-- ------------------------------------------------------------
create table if not exists sync_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid not null,
  health_worker_id uuid references health_workers(id),
  device_id text,
  status text not null check (status in ('inserted', 'updated', 'skipped_duplicate', 'error')),
  error_message text,
  synced_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security (Supabase)
-- Any signed-in health worker (any role) can read/write every patient's data —
-- screening data is shared across the whole team, not siloed to whoever
-- registered the patient. A patient who has their own login can only see
-- their own record and their own related data.
-- (Note: the Express API in this repo connects with a service-role/pooled
-- connection and enforces this same logic in the controllers, so these
-- policies are mainly defense-in-depth for any direct Supabase-client access.)
-- ============================================================
alter table health_workers enable row level security;
alter table patients enable row level security;
alter table symptom_assessments enable row level security;
alter table sensor_sessions enable row level security;
alter table gait_features enable row level security;
alter table xray_studies enable row level security;
alter table risk_assessments enable row level security;
alter table referrals enable row level security;

-- Helper: is the current auth user any kind of health worker (worker/officer/admin)?
create or replace function is_health_worker() returns boolean as $$
  select exists (select 1 from health_workers where auth_user_id = auth.uid());
$$ language sql stable security definer;

-- Helper: is the current auth user an officer/admin?
create or replace function is_officer_or_admin() returns boolean as $$
  select exists (
    select 1 from health_workers
    where auth_user_id = auth.uid() and role in ('officer', 'admin')
  );
$$ language sql stable security definer;

create policy hw_self_select on health_workers
  for select using (auth_user_id = auth.uid() or is_officer_or_admin());

-- Any health worker can read/write every patient.
create policy patients_health_worker_all on patients
  for all using (is_health_worker()) with check (is_health_worker());

-- A patient with their own login can create their profile (self-registration)...
create policy patients_self_insert on patients
  for insert with check (auth_user_id = auth.uid());

-- ...and can view/update only their own record afterward.
create policy patients_self_select on patients
  for select using (auth_user_id = auth.uid());

create policy patients_self_update on patients
  for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy symptoms_health_worker_all on symptom_assessments
  for all using (is_health_worker()) with check (is_health_worker());

create policy symptoms_self_select on symptom_assessments
  for select using (
    patient_id in (select id from patients where auth_user_id = auth.uid())
  );

create policy sensor_health_worker_all on sensor_sessions
  for all using (is_health_worker()) with check (is_health_worker());

create policy sensor_self_select on sensor_sessions
  for select using (
    patient_id in (select id from patients where auth_user_id = auth.uid())
  );

create policy gait_health_worker_all on gait_features
  for all using (is_health_worker()) with check (is_health_worker());

create policy gait_self_select on gait_features
  for select using (
    sensor_session_id in (
      select ss.id from sensor_sessions ss
      join patients p on p.id = ss.patient_id
      where p.auth_user_id = auth.uid()
    )
  );

create policy xray_health_worker_all on xray_studies
  for all using (is_health_worker()) with check (is_health_worker());

create policy xray_self_select on xray_studies
  for select using (
    patient_id in (select id from patients where auth_user_id = auth.uid())
  );

create policy risk_health_worker_all on risk_assessments
  for all using (is_health_worker()) with check (is_health_worker());

create policy risk_self_select on risk_assessments
  for select using (
    patient_id in (select id from patients where auth_user_id = auth.uid())
  );

create policy referrals_health_worker_all on referrals
  for all using (is_health_worker()) with check (is_health_worker());

create policy referrals_self_select on referrals
  for select using (
    patient_id in (select id from patients where auth_user_id = auth.uid())
  );

-- ============================================================
-- Dashboard view (officer-facing aggregates)
-- ============================================================
create or replace view v_district_risk_summary as
select
  p.district,
  p.block,
  count(distinct p.id) as total_patients,
  count(*) filter (where r.risk_tier = 'low') as low_count,
  count(*) filter (where r.risk_tier = 'moderate') as moderate_count,
  count(*) filter (where r.risk_tier = 'high') as high_count,
  count(distinct ref.id) filter (where ref.status = 'pending') as pending_referrals,
  count(distinct ref.id) filter (where ref.status = 'completed') as completed_referrals
from patients p
left join risk_assessments r on r.patient_id = p.id
left join referrals ref on ref.patient_id = p.id
group by p.district, p.block;
