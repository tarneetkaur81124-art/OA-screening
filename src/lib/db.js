import Dexie from 'dexie'

// Local-first storage. Every screening is written here FIRST, always —
// whether the device is online or not — then pushed to Supabase in the
// background (see sync.js). Supabase itself has no offline persistence,
// so this table is what actually makes the app usable in low-connectivity
// areas of NER.
export const db = new Dexie('oaSathiDB')

db.version(1).stores({
  // localId is a client-generated UUID (not an auto-increment number) so that
  // retried syncs never create duplicate rows in Supabase — the same record
  // always carries the same id whether it's inserted now or three days later.
  // patientPhone ties a screening to a patient identity, so a health worker
  // on a different device can look up a patient's prior self-screening by
  // phone number once it's synced to Supabase.
  screenings: 'localId, patientPhone, patientName, riskLevel, createdAt, synced'
})

export async function saveScreeningLocally(screening) {
  const record = {
    ...screening,
    // If the caller didn't pass a patientPhone explicitly (worker-assisted
    // screenings always do), fall back to the logged-in patient's own phone,
    // stashed at login — see Login.jsx.
    patientPhone: screening.patientPhone ?? localStorage.getItem('oaSathiPatientPhone') ?? null,
    localId: screening.localId ?? crypto.randomUUID(),
    createdAt: screening.createdAt ?? new Date().toISOString(),
    synced: false
  }
  await db.screenings.put(record)
  return record
}

export async function getUnsyncedScreenings() {
  return db.screenings.where('synced').equals(false).toArray()
}

export async function markScreeningSynced(localId) {
  await db.screenings.update(localId, { synced: true })
}

export async function getAllScreenings() {
  return db.screenings.orderBy('createdAt').reverse().toArray()
}

// Used on the worker side to check this device's own local cache for a
// patient's prior screening before falling back to a Supabase lookup
// (see src/lib/patientLookup.js) — useful if the same worker screened
// this patient before, even offline.
export async function getLocalScreeningsByPhone(phone) {
  return db.screenings.where('patientPhone').equals(phone).reverse().sortBy('createdAt')
}
