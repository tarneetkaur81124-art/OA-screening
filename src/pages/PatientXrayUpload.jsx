import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import XrayUploadPanel from '../components/XrayUploadPanel.jsx'
import { saveScreeningLocally } from '../lib/db.js'
import { analyzeXrayImage } from '../lib/xrayPipeline.js'

export default function PatientXrayUpload() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [note, setNote] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleFileChange(e) {
    const selected = e.target.files?.[0]
    if (!selected) return
    setFile(selected)
    setPreview(URL.createObjectURL(selected))
    setAnalyzing(true)
    const result = await analyzeXrayImage(selected)
    setAnalysis(result)
    setAnalyzing(false)
  }

  async function handleSubmit() {
    setSaving(true)
    // Saved locally first, syncs to Supabase when online — same pattern as
    // the questionnaire and gait recording. riskLevel stays null even with
    // an AI reading attached — deciding what an X-ray means for this
    // patient is left to a health worker, not shown as a final verdict here.
    await saveScreeningLocally({
      method: 'xray',
      riskLevel: null,
      xrayNote: note,
      xrayAnalysis: analysis
    })
    setSaving(false)
    navigate('/dashboard/patient')
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl mb-1">Upload an X-ray</h1>
      <p className="text-ink-soft mb-5">
        If you already have a knee X-ray from an earlier visit, add it here so a health worker can
        review it alongside your screening results.
      </p>

      <div className="mb-5">
        <XrayUploadPanel
          preview={preview}
          fileLabel={file?.name}
          note={note}
          onFileChange={handleFileChange}
          onNoteChange={(e) => setNote(e.target.value)}
          title="X-ray image"
          notePlaceholder="Where and when this X-ray was taken, if known"
        />
        {analyzing && <p className="text-sm text-ink-soft mt-2">Analyzing X-ray...</p>}
        {analysis?.status === 'complete' && (
          <div className="bg-bg border border-line rounded-md px-4 py-3 mt-2 text-sm">
            <strong>Preliminary AI reading:</strong> {analysis.findings ?? 'See details'}
            <p className="text-xs text-ink-soft mt-1 mb-0">
              This is not a diagnosis — a health worker will review it properly.
            </p>
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!file || saving}
        className="w-full py-2.5 rounded-md bg-primary text-white font-semibold hover:bg-primary-dark disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save X-ray to my record'}
      </button>
    </div>
  )
}
