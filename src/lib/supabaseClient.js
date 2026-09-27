import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Loud failure on purpose — a silently-missing env var is a painful bug to chase
  // during a demo. Copy .env.example to .env and fill in real values.
  console.warn(
    'Supabase env vars are missing. Copy .env.example to .env and add your project URL + anon key. ' +
    'Using placeholder values for now, so the app will still run — but any real Supabase call (sync, ' +
    'search, auth) will fail until real credentials are set.'
  )
}

// createClient() throws immediately if given an invalid URL, which would crash
// the whole app on load — including pages that never call Supabase yet, like
// the login screens right now. Falling back to a validly-formatted placeholder
// keeps the app runnable for demo/dev before a real Supabase project is wired up.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
)
