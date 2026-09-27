import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { koosSubscales, koosOptions } from '../data/koosQuestions.js'
import { scoreKoos, riskLevelFromOverall } from '../lib/koosScore.js'
import { saveScreeningLocally } from '../lib/db.js'
import RiskPill from '../components/RiskPill.jsx'

export default function PatientQuestionnaire() {
  const navigate = useNavigate()
  const { state } = useLocation()
  // Present only when a health worker is filling this out on behalf of a
  // new patient (no prior home self-screening to reuse) — see RegisterPatient.jsx.
  const workerMode = state?.workerMode ?? false
  const patientPhone = state?.patientPhone
  const patientName = state?.patientName
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState(() =>
    Object.fromEntries(koosSubscales.map((s) => [s.key, Array(s.items.length).fill(null)]))
  )
  const [result, setResult] = useState(null)
  const [saving, setSaving] = useState(false)

  const subscale = koosSubscales[stepIndex]
  const isLastStep = stepIndex === koosSubscales.length - 1
  const currentAnswers = answers[subscale.key]
  const allAnswered = currentAnswers.every((v) => v !== null)

  function setAnswer(itemIndex, value) {
    setAnswers((prev) => ({
      ...prev,
      [subscale.key]: prev[subscale.key].map((v, i) => (i === itemIndex ? value : v))
    }))
  }

  async function handleNext() {
    if (!isLastStep) {
      setStepIndex((i) => i + 1)
      return
    }
    setSaving(true)
    const scores = scoreKoos(answers)
    const riskLevel = riskLevelFromOverall(scores.overall)

    // Written to Dexie first, always — this is what makes the screening
    // work offline. It syncs to Supabase automatically next time the
    // device is online (see src/lib/sync.js).
    await saveScreeningLocally({
      method: 'questionnaire',
      riskLevel,
      koosScores: scores,
      ...(workerMode ? { patientPhone, patientName } : {})
    })

    setSaving(false)
    setResult({ scores, riskLevel })
  }

  if (result) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl mb-1">Your result</h1>
        <p className="text-ink-soft mb-5">Based on the KOOS questionnaire you just completed.</p>

        <div className="bg-white border border-line rounded-lg p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-ink-soft">Overall risk level</span>
            <RiskPill level={result.riskLevel} />
          </div>
          <ul className="text-sm space-y-2 list-none p-0 m-0">
            {koosSubscales.map((s) => (
              <li key={s.key} className="flex justify-between border-b border-line pb-2">
                <span>{s.label}</span>
                <span className="font-semibold">{result.scores[s.key] ?? '—'}/100</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-soft mt-3 mb-0">
            Higher scores mean fewer problems. This is a screening signal, not a diagnosis —
            a Moderate or High result means it's worth visiting a health worker for a closer check.
          </p>
        </div>

        {workerMode ? (
          <button
            onClick={() =>
              navigate('/dashboard/worker/intake/gait', {
                state: {
                  workerMode: true,
                  patientPhone,
                  patientName,
                  koosScores: result.scores,
                  questionnaireRiskLevel: result.riskLevel
                }
              })
            }
            className="px-5 py-2.5 rounded-md bg-accent text-white font-semibold hover:opacity-90"
          >
            Continue: record patient's walk
          </button>
        ) : (
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => navigate('/dashboard/patient/gait-check')}
              className="px-5 py-2.5 rounded-md bg-accent text-white font-semibold hover:opacity-90"
            >
              Continue: record your walk
            </button>
            <button
              onClick={() => navigate('/dashboard/patient')}
              className="px-5 py-2.5 rounded-md border border-line text-ink-soft font-semibold"
            >
              Back to dashboard
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-xl">
      {workerMode && (
        <div className="bg-bg border border-line rounded-md px-4 py-2 text-sm mb-4">
          Screening on behalf of <strong>{patientName}</strong> · {patientPhone}
        </div>
      )}
      <div className="flex justify-between items-center mb-1">
        <h1 className="text-2xl m-0">Knee symptom check</h1>
        <span className="text-sm text-ink-soft">{stepIndex + 1} / {koosSubscales.length}</span>
      </div>
      <p className="text-ink-soft mb-5">{subscale.label}</p>

      <div className="bg-white border border-line rounded-lg p-5 mb-5 flex flex-col gap-5">
        {subscale.items.map((text, i) => (
          <div key={i}>
            <p className="text-sm font-medium mb-2">{text}</p>
            <div className="flex gap-2 flex-wrap">
              {koosOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAnswer(i, opt.value)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    currentAnswers[i] === opt.value
                      ? 'bg-primary text-white border-primary'
                      : 'border-line text-ink-soft hover:border-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between">
        <button
          disabled={stepIndex === 0}
          onClick={() => setStepIndex((i) => i - 1)}
          className="px-4 py-2 rounded-md border border-line text-ink-soft disabled:opacity-40"
        >
          Back
        </button>
        <button
          disabled={!allAnswered || saving}
          onClick={handleNext}
          className="px-5 py-2.5 rounded-md bg-primary text-white font-semibold hover:bg-primary-dark disabled:opacity-40"
        >
          {isLastStep ? (saving ? 'Saving...' : 'See my result') : 'Next section'}
        </button>
      </div>
    </div>
  )
}
