import { supabase } from './supabaseClient.js'

// Demo fallback so a worker can search this number during judging even
// before the real Supabase 'screenings' table has live data in it.
// Remove once real patient data exists.
const DEMO_PATIENTS = {
  '9876500001': {
    patientPhone: '9876500001',
    patientName: 'Momita Deb',
    latest: {
      method: 'questionnaire + camera_gait',
      riskLevel: 'high',
      koosScores: { pain: 42, symptoms: 48, adl: 50, sport: 35, qol: 40, overall: 43 },
      gaitAnalysis: { status: 'pending', note: 'Recorded 3 days ago, awaiting pose analysis' },
      createdAt: '2026-09-15T09:12:00.000Z'
    }
  }
}

// Looks up a patient's most recent self-screening by phone number.
// Tries Supabase first (real cross-device data); falls back to the demo
// record above if Supabase isn't reachable or configured yet.
export async function findPatientByPhone(phone) {
  try {
    const { data, error } = await supabase
      .from('screenings')
      .select('*')
      .eq('patient_phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) throw error
    if (data && data.length > 0) {
      return {
        patientPhone: phone,
        patientName: data[0].patient_name ?? null,
        latest: data[0],
        source: 'supabase'
      }
    }
    if (data && data.length === 0) return null
  } catch (err) {
    console.warn('Supabase lookup unavailable, checking demo data instead:', err.message)
  }

  return DEMO_PATIENTS[phone] ? { ...DEMO_PATIENTS[phone], source: 'demo' } : null
}
