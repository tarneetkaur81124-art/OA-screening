import { mlApiFetch } from './mlApiClient.js'

// Calls the ML team's X-ray analysis API. Set VITE_ML_API_URL and
// VITE_ML_API_KEY in .env once their model is deployed (see
// ml_api_example.py for the expected server shape, and app/auth.py on
// their side for the API key check).
//
// Returns (on success), shape depends on what your model outputs — adjust
// the fields below to match once the ML team confirms their actual response:
//   {
//     status: 'complete',
//     klGrade: number,               // e.g. Kellgren-Lawrence grade, or your model's scale
//     findings: string,              // short text summary
//     riskContribution: 'low' | 'mid' | 'high'
//   }
//
// imageFile: the uploaded X-ray as a File/Blob
export async function analyzeXrayImage(imageFile) {
  const apiUrl = import.meta.env.VITE_ML_API_URL

  if (!apiUrl) {
    console.warn('VITE_ML_API_URL is not set — returning placeholder X-ray analysis.')
    return { status: 'pending', note: 'X-ray analysis API not configured yet.' }
  }

  try {
    const formData = new FormData()
    formData.append('image', imageFile, imageFile.name)

    const result = await mlApiFetch('/analyze-xray', formData)
    return { status: 'complete', ...result }
  } catch (err) {
    console.error('X-ray analysis request failed:', err)
    // The X-ray still saves either way — this just means the automated
    // reading isn't attached, and a health worker's manual note still counts.
    return { status: 'error', note: err.message }
  }
}
