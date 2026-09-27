import { useEffect, useState } from 'react'
import { getUnsyncedScreenings } from '../lib/db.js'
import { syncPendingScreenings } from '../lib/sync.js'

export default function SyncBadge() {
  const [pendingCount, setPendingCount] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)

  async function refreshPendingCount() {
    const pending = await getUnsyncedScreenings()
    setPendingCount(pending.length)
  }

  useEffect(() => {
    refreshPendingCount()

    async function handleOnline() {
      setOnline(true)
      await syncPendingScreenings()
      await refreshPendingCount()
    }
    function handleOffline() {
      setOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const isSynced = online && pendingCount === 0

  return (
    <div className="flex items-center gap-2 text-xs px-2.5 py-2 rounded-md bg-white/10">
      <span className={`w-2 h-2 rounded-full ${isSynced ? 'bg-risk-low' : 'bg-gold'}`} />
      <span>
        {!online
          ? 'Offline — saving locally'
          : pendingCount > 0
            ? `Syncing ${pendingCount} record${pendingCount > 1 ? 's' : ''}...`
            : 'All records synced'}
      </span>
    </div>
  )
}
