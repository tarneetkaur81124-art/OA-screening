// Shared by gaitPipeline.js and xrayPipeline.js so the API key header only
// needs to be set in one place. Matches the auth your ML team added in
// app/auth.py — the key must be sent as the 'X-API-Key' header on every
// request, or their verify_api_key() dependency rejects it with a 403.
export async function mlApiFetch(path, formData) {
  const apiUrl = import.meta.env.VITE_ML_API_URL
  const apiKey = import.meta.env.VITE_ML_API_KEY

  if (!apiKey) {
    console.warn(
      'VITE_ML_API_KEY is not set — requests to the ML API will be rejected with a 403 ' +
      'once their backend\'s API key protection is live.'
    )
  }

  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey ?? ''
    },
    body: formData
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('ML API rejected the request (403) — check VITE_ML_API_KEY matches their .env')
    }
    throw new Error(`ML API returned ${response.status}`)
  }

  return response.json()
}
