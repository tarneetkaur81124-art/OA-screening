import { supabase } from './supabaseClient.js'
import { getUnsyncedScreenings, markScreeningSynced } from './db.js'

// Call this once when the app boots, and it re-runs whenever the browser's
// online event fires. Conflict handling stays simple on purpose: each health
// worker/patient is creating NEW records, not editing the same row at the
// same time, so there's nothing to merge — just insert-if-not-already-there.
export async function syncPendingScreenings() {
  if (!navigator.onLine) return { synced: 0, failed: 0 }

  const pending = await getUnsyncedScreenings()
  let synced = 0
  let failed = 0

  for (const record of pending) {
    const { localId, synced: _synced, ...payload } = record
    const { error } = await supabase
      .from('screenings')
      .upsert({ id: localId, ...payload }, { onConflict: 'id' })

    if (error) {
      failed += 1
      console.error('Sync failed for record', localId, error.message)
      continue
    }
    await markScreeningSynced(localId)
    synced += 1
  }

  return { synced, failed }
}

export function startSyncListener() {
  window.addEventListener('online', syncPendingScreenings)
  // Also try once at load, in case the app opened already online with a backlog
  syncPendingScreenings()
}
