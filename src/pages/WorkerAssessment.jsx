import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { connectSensorKit, readSensorReadings } from '../lib/sensorPipeline.js'
import { analyzeXrayImage } from '../lib/xrayPipeline.js'
import { saveScreeningLocally } from '../lib/db.js'
import RiskPill from '../components/RiskPill.jsx'
import XrayUploadPanel from '../components/XrayUploadPanel.jsx'

const riskOptions = [
  { value: 'low', label: 'Low' },
  { value: 'mid', label: 'Moderate' },
  { value: 'high', label: 'High' }
]

export default function WorkerAssessment() {
  const { state } = useLocation()
  const navigate = useNavigate()

  // Guard against a direct page load with no patient context (e.g. a refresh)
  if (!state) {
    return (
      <div className="max-w-xl">
        <p className="text-ink-soft mb-4">No patient selected yet.</p>
        <button
          onClick={() => navigate('/dashboard/worker/register')}
          className="px-5 py-2.5 rounded-md bg-primary text-white font-semibold"
        >
          Find or register a patient
        </button>
      </div>
    )
  }

  const { phone, patientName, mode, existingSummary } = state

  const [deviceConnected, setDeviceConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [sensorResult, setSensorResult] = useState(null)
  const [sensorError, setSensorError] = useState('')

  const [xrayFile, setXrayFile] = useState(null)
  const [xrayPreview, setXrayPreview] = useState(null)
  const [xrayNote, setXrayNote] = useState('')
  const [xrayAnalysis, setXrayAnalysis] = useState(null)
  const [xrayAnalyzing, setXrayAnalyzing] = useState(false)

  const [finalRisk, setFinalRisk] = useState(existingSummary?.riskLevel ?? 'mid')
  const [saving, setSaving] = useState(false)

  async function handleConnectSensor() {
    setSensorError('')
    setConnecting(true)
    try {
      const device = await connectSensorKit()
      setDeviceConnected(true)
      const result = await readSensorReadings(device)
      setSensorResult(result)
    } catch (err) {
      setSensorError(err.message)
    } finally {
      setConnecting(false)
    }
  }

  async function handleXrayUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setXrayFile(file)
    setXrayPreview(URL.createObjectURL(file))
    setXrayAnalyzing(true)
    const result = await analyzeXrayImage(file)
    setXrayAnalysis(result)
    setXrayAnalyzing(false)
  }

  async function handleComplete() {
    setSaving(true)
    await saveScreeningLocally({
      method: 'worker_assisted',
      patientPhone: phone,
      patientName,
      riskLevel: finalRisk,
      sensorData: sensorResult,
      xrayNote,
      xrayAnalysis,
      // links this worker-assessment back to the patient's home
      // self-screening, if there was one, so the full history stays connected
      linkedPriorScreeningAt: existingSummary?.createdAt ?? existingSummary?.created_at ?? null
    })
    setSaving(false)
    navigate('/dashboard/worker')
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl mb-1">Sensor &amp; X-ray assessment</h1>
      <p className="text-ink-soft mb-5">
        {patientName} · {phone} · {mode === 'existing' ? 'Continuing from home self-screening' : 'Newly registered patient'}
      </p>

      {/* Prior self-screening reference, only shown when one exists */}
      {existingSummary && (
        <div className="bg-bg border border-line rounded-lg p-4 mb-5">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold">
              {existingSummary.justCompleted ? 'Questionnaire & gait video — just completed' : 'Home self-screening on file'}
            </span>
            <RiskPill level={existingSummary.riskLevel ?? existingSummary.risk_level} />
          </div>
          <p className="text-xs text-ink-soft m-0">
            {existingSummary.method} ·{' '}
            {new Date(existingSummary.createdAt ?? existingSummary.created_at).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric'
            })}
            {existingSummary.justCompleted
              ? ' — captured during this visit, now continuing to sensor & X-ray.'
              : ' — questionnaire and gait video do not need to be repeated.'}
          </p>
        </div>
      )}

      {/* Sensor kit pairing */}
      <div className="bg-white border border-line rounded-lg p-5 mb-5">
        <h2 className="text-base mb-3">Sensor kit</h2>
        {!deviceConnected ? (
          <button
            onClick={handleConnectSensor}
            disabled={connecting}
            className="px-5 py-2.5 rounded-md bg-primary text-white font-semibold hover:bg-primary-dark disabled:opacity-50"
          >
            {connecting ? 'Connecting...' : 'Connect sensor kit'}
          </button>
        ) : (
          <div className="text-sm">
            <p className="text-risk-low font-semibold mb-1">Sensor kit connected</p>
            <p className="text-ink-soft m-0">
              {sensorResult?.status === 'pending'
                ? sensorResult.note
                : 'Reading gait and joint angle data...'}
            </p>
          </div>
        )}
        {sensorError && <p className="text-sm text-accent mt-2">{sensorError}</p>}
      </div>

      {/* X-ray upload */}
      <div className="mb-5">
        <XrayUploadPanel
          preview={xrayPreview}
          fileLabel={xrayFile?.name}
          note={xrayNote}
          onFileChange={handleXrayUpload}
          onNoteChange={(e) => setXrayNote(e.target.value)}
          title="X-ray (optional)"
          notePlaceholder="Observations from the X-ray, if reviewed"
        />
        {xrayAnalyzing && (
          <p className="text-sm text-ink-soft mt-2">Analyzing X-ray...</p>
        )}
        {xrayAnalysis?.status === 'complete' && (
          <div className="bg-bg border border-line rounded-md px-4 py-3 mt-2 text-sm">
            <strong>AI reading:</strong> {xrayAnalysis.findings ?? 'See details'}
            {xrayAnalysis.klGrade !== undefined && ` · KL grade ${xrayAnalysis.klGrade}`}
          </div>
        )}
        {xrayAnalysis?.status === 'error' && (
          <p className="text-sm text-accent mt-2">
            Automated reading unavailable right now — your notes above still get saved.
          </p>
        )}
      </div>

      {/* Final risk confirmation */}
      <div className="bg-white border border-line rounded-lg p-5 mb-5">
        <h2 className="text-base mb-3">Final risk assessment</h2>
        <div className="flex gap-2">
          {riskOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFinalRisk(opt.value)}
              className={`flex-1 py-2 rounded-md text-sm font-semibold border ${
                finalRisk === opt.value
                  ? 'bg-primary text-white border-primary'
                  : 'border-line text-ink-soft hover:border-primary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleComplete}
        disabled={saving}
        className="w-full py-2.5 rounded-md bg-primary text-white font-semibold hover:bg-primary-dark disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save & complete screening'}
      </button>
    </div>
  )
}
