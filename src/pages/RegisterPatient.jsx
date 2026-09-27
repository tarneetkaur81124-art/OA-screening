import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { findPatientByPhone } from '../lib/patientLookup.js'
import RiskPill from '../components/RiskPill.jsx'

export default function RegisterPatient() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [phone, setPhone] = useState(searchParams.get('phone') ?? '')
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState(null)

  const [newName, setNewName] = useState('')
  const [newAge, setNewAge] = useState('')
  const [newVillage, setNewVillage] = useState('')

  async function runSearch(searchPhone) {
    if (!searchPhone || searchPhone.length < 6) return
    setSearching(true)
    const result = await findPatientByPhone(searchPhone)
    setFound(result)
    setSearched(true)
    setSearching(false)
  }

  useEffect(() => {
    if (searchParams.get('phone')) runSearch(searchParams.get('phone'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function continueWithExisting() {
    navigate('/dashboard/worker/assess', {
      state: {
        phone,
        patientName: found.patientName,
        mode: 'existing',
        existingSummary: found.latest
      }
    })
  }

  function registerAndContinue() {
    navigate('/dashboard/worker/intake/questionnaire', {
      state: {
        workerMode: true,
        patientPhone: phone,
        patientName: newName || 'Unnamed patient',
        age: newAge,
        village: newVillage
      }
    })
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl mb-1">Register or find a patient</h1>
      <p className="text-ink-soft mb-5">
        Search by phone number first — if this patient already completed a self-screening from
        home, you can skip straight to the sensor and X-ray step.
      </p>

      <div className="bg-white border border-line rounded-lg p-5 mb-5">
        <label htmlFor="searchPhone" className="block text-sm font-semibold mb-1.5">Patient's mobile number</label>
        <div className="flex gap-2">
          <input
            id="searchPhone"
            type="tel"
            inputMode="numeric"
            placeholder="98xxxxxxxx"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
              setSearched(false)
              setFound(null)
            }}
            className="flex-1 px-3 py-2.5 border-[1.5px] border-line rounded-md bg-bg focus:bg-white focus:border-primary outline-none"
          />
          <button
            onClick={() => runSearch(phone)}
            disabled={searching || phone.length < 6}
            className="px-5 py-2.5 rounded-md bg-primary text-white font-semibold hover:bg-primary-dark disabled:opacity-50"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Existing patient found */}
      {searched && found && (
        <div className="bg-white border border-line rounded-lg p-5 mb-5">
          <div className="flex justify-between items-start mb-3">
            <div>
              <strong className="block">{found.patientName ?? 'Patient'}</strong>
              <span className="text-sm text-ink-soft">{phone}</span>
            </div>
            <RiskPill level={found.latest.riskLevel ?? found.latest.risk_level} />
          </div>

          <p className="text-sm text-ink-soft mb-2">
            Self-screened on {new Date(found.latest.createdAt ?? found.latest.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            {' · '}{found.latest.method ?? found.latest.method}
          </p>

          {found.latest.koosScores && (
            <ul className="text-sm space-y-1 list-none p-0 m-0 mb-2">
              {Object.entries(found.latest.koosScores)
                .filter(([key]) => key !== 'overall')
                .map(([key, value]) => (
                  <li key={key} className="flex justify-between border-b border-line py-1 capitalize">
                    <span>{key}</span>
                    <span className="font-semibold">{value ?? '—'}/100</span>
                  </li>
                ))}
            </ul>
          )}

          <button
            onClick={continueWithExisting}
            className="w-full mt-2 py-2.5 rounded-md bg-accent text-white font-semibold hover:opacity-90"
          >
            Continue with sensor &amp; X-ray assessment
          </button>
        </div>
      )}

      {/* Not found — register as new / walk-in patient */}
      {searched && !found && (
        <div className="bg-white border border-line rounded-lg p-5">
          <p className="text-sm mb-4">
            No prior self-screening found for this number. Register the patient to start with the
            symptom questionnaire and a gait video, followed by the sensor kit and X-ray.
          </p>

          <div className="mb-4">
            <label htmlFor="newName" className="block text-sm font-semibold mb-1.5">Full name</label>
            <input
              id="newName"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2.5 border-[1.5px] border-line rounded-md bg-bg focus:bg-white focus:border-primary outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label htmlFor="newAge" className="block text-sm font-semibold mb-1.5">Age</label>
              <input
                id="newAge"
                type="number"
                value={newAge}
                onChange={(e) => setNewAge(e.target.value)}
                className="w-full px-3 py-2.5 border-[1.5px] border-line rounded-md bg-bg focus:bg-white focus:border-primary outline-none"
              />
            </div>
            <div>
              <label htmlFor="newVillage" className="block text-sm font-semibold mb-1.5">Village / area</label>
              <input
                id="newVillage"
                type="text"
                value={newVillage}
                onChange={(e) => setNewVillage(e.target.value)}
                className="w-full px-3 py-2.5 border-[1.5px] border-line rounded-md bg-bg focus:bg-white focus:border-primary outline-none"
              />
            </div>
          </div>

          <button
            onClick={registerAndContinue}
            disabled={!newName}
            className="w-full py-2.5 rounded-md bg-primary text-white font-semibold hover:bg-primary-dark disabled:opacity-50"
          >
            Register &amp; start questionnaire
          </button>
        </div>
      )}
    </div>
  )
}
