import { mlApiFetch } from './mlApiClient.js'

// Calls the ML team's gait-analysis API. Set VITE_ML_API_URL and
// VITE_ML_API_KEY in .env once their model is deployed (see
// ml_api_example.py for the expected server shape, and app/auth.py on
// their side for the API key check).
//
// Returns (on success):
//   {
//     status: 'complete',
//     kneeFlexionDeg: number,        // range of motion detected
//     strideAsymmetry: number,       // 0-1, higher = more asymmetric gait
//     cadence: number,               // steps per minute
//     riskContribution: 'low' | 'mid' | 'high'
//   }
//
// videoBlob: the recorded/uploaded video as a Blob (webm or mp4)
export async function analyzeGaitVideo(videoBlob) {
  const apiUrl = import.meta.env.VITE_ML_API_URL

  if (!apiUrl) {
    console.warn('VITE_ML_API_URL is not set — returning placeholder gait analysis.')
    return { status: 'pending', note: 'Gait analysis API not configured yet.' }
  }

  try {
    const formData = new FormData()
    formData.append('video', videoBlob, 'gait.webm')

    const result = await mlApiFetch('/analyze-gait', formData)
    return { status: 'complete', ...result }
  } catch (err) {
    console.error('Gait analysis request failed:', err)
    // Screening still saves locally either way — see GaitCapture.jsx — this
    // just means the risk contribution from gait won't be filled in yet.
    return { status: 'error', note: err.message }
  }
}
