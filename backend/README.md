# OA Screening — Backend

Node.js/Express + PostgreSQL backend for the rural osteoarthritis early-screening
project. Runs directly against your existing Supabase Postgres database, so it
sits alongside Supabase Auth rather than replacing it — your frontend keeps using
`@supabase/supabase-js` for login, and calls this API (with the resulting JWT)
for everything else: patients, symptom forms, sensor/gait data, offline sync,
risk scoring, and the district dashboard.

## Why a separate API instead of calling Supabase directly from the frontend?

You *could* do everything with direct Supabase table calls + RLS. This backend exists
for the parts that need real server-side logic:
- **Risk scoring** (KOOS + gait composite) — you don't want a scoring formula
  duplicated in JS in the frontend where it can drift from what your ML team ships.
- **Idempotent offline sync** — batch-upserting a Dexie queue safely needs a
  transaction, not just a loop of client-side `.insert()` calls.
- **Auto-referral creation** on high-risk scores, and the officer dashboard aggregates.

## Two kinds of accounts

Both sign in the same way (Supabase Auth → JWT), but land as a different role:
- **Health worker** (row in `health_workers`) — can register, browse, and access
  *every* patient's data (not just the ones they personally registered).
- **Patient** (row in `patients`, linked via `patients.auth_user_id`) — can sign
  up and log in on their own, without a health worker registering them first, and
  can see only their own record.

## 1. Setup

```bash
cd oa-backend
npm install
cp .env.example .env
```

Fill in `.env`:
- `DATABASE_URL` — Supabase Dashboard → Project Settings → Database → Connection string (URI, use the pooled "Transaction" connection string for serverless hosting, or direct connection for a long-running server).
- `SUPABASE_JWT_SECRET` — Project Settings → API → JWT Secret. This lets the API verify tokens locally without an extra network call to Supabase on every request.

## 2. Create the schema

```bash
npm run migrate
```

This runs `db/schema.sql` — creates all tables, indexes, Row Level Security
policies, and the `v_district_risk_summary` dashboard view. Safe to re-run
(uses `if not exists` / `or replace` throughout).

## 3. Link health workers to Supabase Auth users

Each person who logs in via Supabase Auth needs a row in `health_workers` linking
their `auth.users.id` to a role/village/district. Do this once per teammate (e.g. via
Supabase's SQL editor or Table editor):

```sql
insert into health_workers (auth_user_id, name, role, village, block, district)
values ('<supabase-auth-user-uuid>', 'Health Worker Name', 'worker', 'Village', 'Block', 'District');
```

Use `role = 'officer'` for whoever should see the dashboard endpoints.

Patients don't need this manual step — they sign up via Supabase Auth in the
patient-facing app like anyone else, then the app calls `POST /api/patients/me`
once to create their `patients` row automatically (see Auth section below).

## 4. Run it

```bash
npm run dev   # nodemon, auto-restart
npm start     # plain node
```

Server starts on `PORT` (default 4000). `GET /health` is an unauthenticated
liveness check.

## Auth

Every `/api/*` route requires:
```
Authorization: Bearer <supabase-access-token>
```
Get this from your frontend's `supabase.auth.getSession()`. The backend verifies it
locally with `SUPABASE_JWT_SECRET`, then looks up whichever profile matches: a
`health_workers` row, or a `patients` row (via `patients.auth_user_id`) for a patient
who has logged in themselves.

## API Reference

### Patients
| Method | Path | Notes |
|---|---|---|
| GET / POST | `/api/patients/me` | **Patient self-login flow.** Fetches the signed-in patient's own profile, or creates it on first login (self-registration — no health worker needs to add them first). |
| POST | `/api/patients` | Health-worker-only. Body includes client-generated `id` (UUID) — safe to retry offline |
| GET | `/api/patients?search=&limit=&offset=` | Health-worker-only. Any worker/officer/admin sees **every** patient, not just ones they registered |
| GET | `/api/patients/:id` | Any health worker, or the patient viewing their own record. Includes nested assessments, sensor sessions, risk history, referrals |

### Symptom assessments (digitized KOOS)
| Method | Path |
|---|---|
| POST | `/api/patients/:patientId/assessments` or `/api/assessments` (body has `patient_id`) |
| GET | `/api/patients/:patientId/assessments` |

### Sensor sessions (IMU or vision/pose)
| Method | Path |
|---|---|
| POST | `/api/patients/:patientId/sensor-sessions` — body can include a nested `gait_features` object (with `feature_vector` — the exact engineered features your model expects — plus/instead of the legacy summary columns) if the device/app already computed them |
| GET | `/api/patients/:patientId/sensor-sessions` |

### X-ray studies (EfficientNetB0 KL-grade CNN)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/patients/:patientId/xray-studies` | Body: `{ id, patient_id, knee_side?, image_storage_url }` — upload the radiograph to storage first (same pattern as `sensor_sessions.storage_url`), then register it here. Scored **once**, synchronously, against `ML_XRAY_MODEL_ENDPOINT`; the study is stored unscored if that call fails. |
| GET | `/api/patients/:patientId/xray-studies` | |

### Risk assessment
| Method | Path | Notes |
|---|---|---|
| POST | `/api/patients/:patientId/risk-assessment` | Body optionally pins `symptom_assessment_id` / `sensor_session_id` (vision) / `imu_session_id` / `xray_study_id`; defaults to the patient's latest of each. Fuses whichever of the 4 signals are available. Auto-creates a referral if tier = `high`. |
| GET | `/api/patients/:patientId/risk-assessment/latest` | |

### Referrals
| Method | Path |
|---|---|
| GET | `/api/referrals?status=&district=` |
| PATCH | `/api/referrals/:id` — body `{ status, notes }` |

### Offline sync (Dexie queue → server)
| Method | Path |
|---|---|
| POST | `/api/sync/batch` | Body: `{ patients: [...], symptom_assessments: [...], sensor_sessions: [...] }`, each record keyed by its client-generated UUID. Returns per-record `inserted` / `skipped_duplicate` status so the app can mark them `synced: true` in IndexedDB. |

### Dashboard (officer/admin role only)
| Method | Path |
|---|---|
| GET | `/api/dashboard/summary` | Overall counts: patients, risk tiers, referrals |
| GET | `/api/dashboard/by-district` | Per district/block breakdown |
| GET | `/api/dashboard/trend` | Patients screened per day, last 30 days |

## Risk scoring engine (`src/services/riskEngine.service.js`)

Fuses up to **four** signals — any subset may be present for a given patient,
and weights are renormalized across whichever ones are actually available:

| Signal | Weight | Source |
|---|---|---|
| Symptom | 0.30 | Digitized KOOS questionnaire |
| X-ray | 0.35 | EfficientNetB0 KL-grade CNN, scored once at upload time |
| Gait | 0.20 | Vision/MediaPipe pose model, from a `'vision'` sensor session |
| IMU | 0.15 | Wearable-sensor model, from an `'imu'` sensor session |

- **Symptom score**: normalizes the five KOOS subscales (pain, symptoms, ADL,
  sport/recreation, quality of life) into a single 0-100 score. KOOS itself scores
  100 = best knee health, so each subscale is inverted first; there's no single
  official KOOS composite, so the five are currently averaged equally (adjust the
  weights in `riskEngine.service.js` if your clinical team wants a different mix).
- **X-ray score**: computed once, when the study is uploaded (`xray.controller.js`
  calls `xrayModel.service.js`), and cached on `xray_studies.model_score`. There's
  no rule-based fallback for a radiograph — if the model call fails, the study is
  stored unscored and simply excluded from the fusion until re-scored.
- **Gait / IMU scores**: if `ML_GAIT_MODEL_ENDPOINT` / `ML_IMU_MODEL_ENDPOINT` is
  set, POSTs `{ features }` (the full `gait_features` row, including
  `feature_vector` if the client/edge computed one) and expects
  `{ risk_score: 0-100 }` back. If unset, or the call fails/times out, each
  falls back independently to a transparent rule-based score from stride-time
  variability, knee ROM, cadence asymmetry, and stance-time ratio — so a flaky
  model endpoint in the field never blocks screening.
- **Composite**: weighted average of whichever signals are present, weights
  renormalized to sum to 1 over just those signals. `score_breakdown` on the
  stored `risk_assessments` row shows exactly which signals contributed, at
  what weight, and from which model version.
- **Tiers**: 0-32 low, 33-65 moderate, 66-100 high. High auto-opens a referral.

This is explicitly a **screening/triage** tool — recommendations are phrased
as "refer" / "monitor", never as a diagnosis.

## Notes for your ML teammates

Three separate model services, each a thin HTTP wrapper around your trained model:

**Gait model** — point `ML_GAIT_MODEL_ENDPOINT` at a service that accepts:
```json
{ "features": { "feature_vector": { "...25 MediaPipe features...": 0.0 }, "stride_time_variability": 4.2, "knee_rom_deg": 118, "cadence_asymmetry": 0.15, "stance_time_ratio": 0.58 } }
```
and returns `{ "risk_score": 72.5 }`.

**IMU model** — same contract, on `ML_IMU_MODEL_ENDPOINT`, with `feature_vector`
holding your whole-trial signal-stat + stride-rhythm features instead.

**X-ray model** — point `ML_XRAY_MODEL_ENDPOINT` at a service that accepts:
```json
{ "image_url": "https://.../radiograph.png" }
```
and returns:
```json
{ "kl_grade_probabilities": { "kl0": 0.05, "kl1": 0.10, "kl2": 0.30, "kl3": 0.40, "kl4": 0.15 }, "model_version": "efficientnetb0-v2" }
```
The backend derives `oa_present` (P(KL2)+P(KL3)+P(KL4) > 0.5) and a 0-100
`model_score` from that itself — your service just needs to return the
5-class softmax using the *exact* preprocessing pipeline (aspect-ratio-preserving
resize + normalization) used in training.

Nothing else in the backend needs to change when you swap a mock/stub model
service for a real trained one — same request/response shape either way.

## Notes for your hardware/frontend teammates

- Sensor payloads (`raw_data` on `sensor_sessions`) accept arbitrary JSON — send
  raw IMU streams or pose-landmark arrays as-is; keep large captures in
  `storage_url` (e.g. a Supabase Storage bucket) instead of inline JSON if they
  get big, to stay under the 5MB request body limit.
- Every POST endpoint expects a **client-generated UUID** as `id` — generate it
  with `crypto.randomUUID()` in the browser when the record is first created
  offline, and reuse the same id if you retry the sync. That's what makes
  `/api/sync/batch` safe to call repeatedly on flaky connections.
