import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'

export default function Login() {
  const [searchParams] = useSearchParams()
  const initialRole = searchParams.get('role') === 'worker' ? 'worker' : 'patient'
  const [role, setRole] = useState(initialRole)
  const navigate = useNavigate()

  // --- Patient: phone + OTP ---
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpError, setOtpError] = useState('')

  async function sendOtp() {
    setOtpError('')
    const { error } = await supabase.auth.signInWithOtp({ phone: `+91${phone}` })
    if (error) return setOtpError(error.message)
    setOtpSent(true)
  }

  async function verifyOtpAndContinue() {
    const { error } = await supabase.auth.verifyOtp({ phone: `+91${phone}`, token: otp, type: 'sms' })
    if (error) return setOtpError(error.message)

    // Used to tag this patient's own screenings with their phone number,
    // so a health worker on another device can look them up later —
    // see src/lib/db.js and src/lib/patientLookup.js.
    localStorage.setItem('oaSathiPatientPhone', phone)
    navigate('/dashboard/patient')
  }

  // --- Health worker: ID + password ---
  const [workerId, setWorkerId] = useState('')
  const [workerPassword, setWorkerPassword] = useState('')
  const [workerCentre, setWorkerCentre] = useState('Dibrugarh Rural Health Camp')
  const [workerError, setWorkerError] = useState('')

  async function workerLogin(e) {
    e.preventDefault()
    setWorkerError('')
    const { error } = await supabase.auth.signInWithPassword({
      email: workerId,
      password: workerPassword
    })
    if (error) return setWorkerError(error.message)
    navigate('/dashboard/worker')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-10 relative">
      <Link to="/" className="absolute top-6 left-6 text-sm text-ink-soft hover:text-primary-dark no-underline">
        &larr; Back to home
      </Link>

      <div className="bg-white border border-line rounded-2xl max-w-[420px] w-full px-7 pt-8 pb-7">
        <div className="flex items-center gap-2 justify-center mb-4 text-primary">
          <svg viewBox="0 0 40 40" width="24" height="24">
            <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <path d="M13 24 C13 17, 27 17, 27 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="20" cy="14" r="2.6" fill="currentColor" />
          </svg>
          <span className="font-serif font-semibold text-lg text-primary-dark">OA Sathi</span>
        </div>
        <h1 className="text-center text-xl mb-1">Log in</h1>
        <p className="text-center text-sm text-ink-soft mb-5">Choose how you'd like to continue</p>

        <div className="flex bg-bg rounded-lg p-0.5 mb-5 text-sm">
          <button
            type="button"
            onClick={() => setRole('patient')}
            className={`flex-1 py-2 rounded-md font-semibold ${role === 'patient' ? 'bg-white text-primary-dark shadow-sm' : 'text-ink-soft'}`}
          >
            Patient
          </button>
          <button
            type="button"
            onClick={() => setRole('worker')}
            className={`flex-1 py-2 rounded-md font-semibold ${role === 'worker' ? 'bg-white text-primary-dark shadow-sm' : 'text-ink-soft'}`}
          >
            Health worker
          </button>
        </div>

        {role === 'patient' ? (
          <div>
            <div className="mb-4">
              <label htmlFor="phone" className="block text-sm font-semibold mb-1.5">Mobile number</label>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                placeholder="98xxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2.5 border-[1.5px] border-line rounded-md bg-bg focus:bg-white focus:border-primary outline-none"
              />
            </div>

            {otpSent && (
              <div className="mb-4">
                <label htmlFor="otp" className="block text-sm font-semibold mb-1.5">Enter OTP</label>
                <input
                  id="otp"
                  type="text"
                  maxLength={6}
                  inputMode="numeric"
                  placeholder="6-digit code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full px-3 py-2.5 border-[1.5px] border-line rounded-md bg-bg focus:bg-white focus:border-primary outline-none"
                />
                <p className="text-xs text-ink-soft mt-1">Sent by SMS to your number</p>
              </div>
            )}

            {otpError && <p className="text-xs text-accent mb-3">{otpError}</p>}

            {!otpSent ? (
              <button
                onClick={sendOtp}
                className="w-full py-2.5 rounded-md bg-primary text-white font-semibold hover:bg-primary-dark transition-colors"
              >
                Send OTP
              </button>
            ) : (
              <button
                onClick={verifyOtpAndContinue}
                className="w-full py-2.5 rounded-md bg-primary text-white font-semibold hover:bg-primary-dark transition-colors"
              >
                Continue
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={workerLogin}>
            <div className="mb-4">
              <label htmlFor="workerId" className="block text-sm font-semibold mb-1.5">Health worker ID or email</label>
              <input
                id="workerId"
                type="text"
                required
                placeholder="e.g. ASHA-DBR-0042"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                className="w-full px-3 py-2.5 border-[1.5px] border-line rounded-md bg-bg focus:bg-white focus:border-primary outline-none"
              />
            </div>
            <div className="mb-4">
              <label htmlFor="workerPassword" className="block text-sm font-semibold mb-1.5">Password</label>
              <input
                id="workerPassword"
                type="password"
                required
                placeholder="••••••••"
                value={workerPassword}
                onChange={(e) => setWorkerPassword(e.target.value)}
                className="w-full px-3 py-2.5 border-[1.5px] border-line rounded-md bg-bg focus:bg-white focus:border-primary outline-none"
              />
            </div>
            <div className="mb-4">
              <label htmlFor="workerCentre" className="block text-sm font-semibold mb-1.5">Health centre</label>
              <select
                id="workerCentre"
                value={workerCentre}
                onChange={(e) => setWorkerCentre(e.target.value)}
                className="w-full px-3 py-2.5 border-[1.5px] border-line rounded-md bg-bg focus:bg-white focus:border-primary outline-none"
              >
                <option>Dibrugarh Rural Health Camp</option>
                <option>Kohima PHC</option>
                <option>Imphal Community Centre</option>
              </select>
            </div>

            {workerError && <p className="text-xs text-accent mb-3">{workerError}</p>}

            <button
              type="submit"
              className="w-full py-2.5 rounded-md bg-primary text-white font-semibold hover:bg-primary-dark transition-colors"
            >
              Log in
            </button>
          </form>
        )}

        <p className="text-center text-sm text-ink-soft mt-4">
          New here? <a href="#" className="text-primary font-semibold no-underline">Create an account</a>
        </p>
      </div>
    </div>
  )
}
