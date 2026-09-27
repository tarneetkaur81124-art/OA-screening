# OA Sathi — Frontend

React + Vite + Tailwind CSS PWA for the OA screening platform.

## Setup

```bash
npm install
cp .env.example .env
# then fill in your Supabase project URL + anon key in .env
npm run dev
```

Open the printed localhost URL. The dashboard is reachable at `/dashboard/patient`
or `/dashboard/worker` (or just log in from the home page).

## What's wired up vs. what's a placeholder

**Wired up (real, working):**
- Routing between Home / Login / Patient Dashboard / Worker Dashboard (`react-router-dom`)
- Tailwind design tokens matching the HTML prototype's palette (`tailwind.config.js`)
- PWA config with offline app-shell caching (`vite-plugin-pwa` in `vite.config.js`)
- Dexie local-first database for screenings (`src/lib/db.js`) — every screening
  should be written here FIRST, synced status `false`
- Sync queue that pushes unsynced Dexie records to Supabase when back online
  (`src/lib/sync.js`) — call `startSyncListener()` once, e.g. in `main.jsx`,
  once you're ready to test it against a real Supabase table
- KOOS questionnaire (`src/pages/PatientQuestionnaire.jsx`), with the real
  scoring formula in `src/lib/koosScore.js` and item content in
  `src/data/koosQuestions.js`. Reachable via "Start new screening" on the
  patient dashboard. Saves results to Dexie automatically.
  **Note:** KOOS gives five 0-100 subscale scores, not a risk tier — the
  Low/Moderate/High banding in `koosScore.js` is a placeholder your team
  should validate before treating it as a real clinical threshold. Also
  credit KOOS's original developers (koos.nu) in your final submission.
- Gait video capture (`src/pages/GaitCapture.jsx`) — record live via the
  device camera (`MediaRecorder`) or upload an existing video, with
  on-screen instructions for camera placement and what movements to
  record. Reachable from the patient sidebar ("Record gait video") and
  linked from the questionnaire result screen.
  **Handoff point for the ML/pose team:** `src/lib/gaitPipeline.js` has a
  single stub function, `analyzeGaitVideo(videoBlob)` — replace its
  internals with the real MediaPipe/pose pipeline call. Nothing else in
  the UI needs to change once that's wired up. `src/lib/videoUpload.js`
  has a matching stub for uploading the raw video to Supabase Storage —
  needs a `gait-videos` bucket created and its access policy decided.
- Worker-side patient continuity (`src/pages/RegisterPatient.jsx` +
  `src/pages/WorkerAssessment.jsx`): a worker searches by the patient's
  phone number first. If that patient already self-screened from home
  (questionnaire + gait video), the worker sees those results and skips
  straight to the sensor kit + X-ray step — no repeat questionnaire. If
  no prior screening is found, a short registration form runs instead,
  then the same sensor/X-ray step follows.
  **Handoff point for the hardware team:** `src/lib/sensorPipeline.js` has
  two stubs, `connectSensorKit()` (Web Bluetooth pairing) and
  `readSensorReadings()` — fill in your ESP32's actual advertised name
  and GATT service/characteristic UUIDs once your firmware side is ready.
  **Cross-device note:** the phone-number lookup only finds a patient's
  prior screening if it already synced to Supabase from their device —
  it can't see another device's purely-local (offline, unsynced) data.
  `src/lib/patientLookup.js` includes one demo patient (phone
  `9876500001`) so this flow is judge-able even before a real Supabase
  table has data in it.
- X-ray upload: available on both sides, via the shared
  `src/components/XrayUploadPanel.jsx`. Patients can attach an existing
  X-ray from `src/pages/PatientXrayUpload.jsx` (sidebar: "Upload X-ray"),
  saved with `riskLevel: null` since reading an X-ray is left to a health
  worker, not self-assessed. Workers use the same panel inside
  `WorkerAssessment.jsx` alongside the sensor kit step. The sensor kit
  (Bluetooth/ESP32 pairing) stays worker-only — patients never see it.

## Connecting the Node/Express + Postgres backend (oa-backend/)

Your teammate's backend runs on Supabase's Postgres database and Auth — it
doesn't replace Supabase, it sits in front of it. The frontend still uses
`@supabase/supabase-js` for login; after that, it sends the resulting session
token to the Express API (`src/lib/apiClient.js`) for everything else.

**Wired up already:**
- Real Supabase auth in `Login.jsx` — `signInWithPassword` for workers,
  `signInWithOtp`/`verifyOtp` for patients. **Note:** phone OTP requires an
  SMS provider (e.g. Twilio) configured in your Supabase project's Auth
  settings — it won't send real texts until that's set up.
- `src/lib/apiClient.js` — attaches the logged-in worker's Supabase session
  token as `Authorization: Bearer <token>` on every call to the backend, per
  their `src/middleware/auth.js`. Set `VITE_API_BASE_URL` in `.env` to
  wherever `oa-backend` is running (e.g. `http://localhost:4000/api`).

**Paused, pending three decisions with your team** — going further before
these are settled risks building against the wrong data model:

1. **No patient-authored data path exists in the backend yet.** Every route
   requires a `health_workers` row; `patients.health_worker_id` is `not null`.
   A patient can't currently push their own self-screening — only a worker
   can create a patient record. This conflicts with the home self-screening
   feature. Either the backend adds a patient-owned auth path (schema +
   middleware change), or the product flow changes so patient data only
   reaches the backend once a worker handles it in person.
2. **Cross-worker patient search by phone isn't supported yet.**
   `GET /api/patients` only returns the requesting worker's own patients,
   with no phone-number search. `RegisterPatient.jsx`'s "search any patient
   by phone" flow needs a new backend endpoint regardless of how #1 resolves.
3. **Questionnaire mismatch: the backend's schema, validators, and risk
   engine are built for WOMAC (pain/stiffness/function, 0-20/0-8/0-68), not
   the KOOS questionnaire already built in `PatientQuestionnaire.jsx`.**
   These aren't interchangeable — recommend switching the frontend
   questionnaire to WOMAC, since the backend's scoring logic is the harder
   piece to redo, but that's a call for the team to make.

**One concrete answer this backend gave us:** the gait feature contract for
your ML team is now unambiguous — `stride_time_variability`, `knee_rom_deg`,
`cadence_asymmetry`, `stance_time_ratio` (see `db/schema.sql`'s
`gait_features` table and `src/services/riskEngine.service.js`). Once
decisions above are settled, `gaitPipeline.js` should be updated to return
these exact field names instead of the placeholder ones it has now.

## Connecting your ML team's gait and X-ray models

Their models run as a small web API, which the frontend calls over HTTP —
this works regardless of whether the model is PyTorch, TensorFlow, or
anything else, since the frontend only ever sees JSON back.

1. Your ML team wraps their model in a FastAPI (or Flask) app with two
   endpoints: `POST /analyze-gait` (accepts a video file) and
   `POST /analyze-xray` (accepts an image file), each returning JSON.
   `ml_api_example.py` in the project root is a working starting point —
   they replace the two `TODO` lines with their actual model calls.
2. They run it locally (`uvicorn ml_api_example:app --reload --port 8000`)
   or deploy it somewhere reachable (Render, Railway, a college server,
   even a temporary ngrok tunnel for a demo).
3. Set `VITE_ML_API_URL` in your `.env` to that server's URL (e.g.
   `http://localhost:8000` for local testing, or the deployed URL).
4. If they've added API key protection on their side (see their
   `app/auth.py`), also set `VITE_ML_API_KEY` in your `.env` to match
   their `.env`'s `API_KEY` value exactly. `src/lib/mlApiClient.js`
   sends it as the `X-API-Key` header on every request — both
   `gaitPipeline.js` and `xrayPipeline.js` already use it, nothing else
   needs to change. **Note:** this key ends up visible in the browser's
   JS bundle since it's a frontend env var — fine for keeping casual
   requests out, not real protection against someone who inspects the
   bundle on purpose.
5. That's it — no other file needs to change. Leaving `VITE_ML_API_URL`
   blank keeps the app running with placeholder results, so the rest of
   the team isn't blocked while the model is still training.

**Sensor kit note:** unlike gait/X-ray, `src/lib/sensorPipeline.js` talks
directly to the ESP32 over Bluetooth from the browser — it doesn't call
the ML backend at all right now. If sensor readings should also be sent
to their backend for analysis (rather than just read locally), that's a
separate piece of wiring not yet built here.

If their model's response fields differ from the example (e.g. different
score names), update the two `analyze*` functions in `gaitPipeline.js` /
`xrayPipeline.js` to match — those two files are the only place that
needs to know the exact shape.

**Still placeholders — this is where your team's work plugs in:**
- Login forms call nothing real yet — the commented-out Supabase calls in
  `src/pages/Login.jsx` are ready to uncomment once phone-auth / email-auth
  are enabled in your Supabase project
- Dashboard data (patient history, worker's patient list, referral queue) is
  hardcoded — replace with Supabase queries (see the comments at the top of
  `PatientDashboard.jsx` / `WorkerDashboard.jsx`)
- No Bluetooth/ESP32 pairing screen yet, no gait-recording camera screen yet,
  no questionnaire form yet — these become new pages under `src/pages/`
- `manifest.json` icons (`icon-192.png`, `icon-512.png`) referenced in
  `vite.config.js` don't exist yet — drop your own into `/public`

## Suggested Supabase table for screenings

```sql
create table screenings (
  id uuid primary key,
  patient_name text,
  patient_id uuid references auth.users,
  camp_id text,
  method text,           -- 'questionnaire' | 'camera_gait' | 'sensor_kit'
  risk_level text,       -- 'low' | 'mid' | 'high'
  knee_flexion_deg numeric,
  created_at timestamptz default now()
);
```

The `id` column matches the `localId` generated on-device in `db.js`, so a
retried sync from a flaky connection never creates a duplicate row.
