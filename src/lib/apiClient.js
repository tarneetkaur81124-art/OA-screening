import { supabase } from './supabaseClient.js'

// Base URL of the Node/Express backend (see oa-backend/ — NOT Supabase's own
// URL). e.g. http://localhost:4000/api for local dev, or wherever it's
// deployed. Set VITE_API_BASE_URL in .env.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) {
    console.warn('No active Supabase session — the backend will reject this request with 401.')
  }
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Every /api/* route on the backend requires this bearer token AND a
// matching row in its health_workers table (see their src/middleware/auth.js).
// This currently means only a logged-in HEALTH WORKER session can call this
// client successfully — see the note in patientLookup.js and sync.js about
// the open question on patient-authored data.
export async function apiFetch(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not set — point it at your Node backend, e.g. http://localhost:4000/api')
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
    ...(options.headers || {})
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || `API request failed: ${response.status}`)
  }

  return response.json()
}
