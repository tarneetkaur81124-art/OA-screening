import { Link } from 'react-router-dom'
import RiskPill from '../components/RiskPill.jsx'

export default function PatientDashboard() {
  // Placeholder data — replace with a Supabase query for the logged-in patient's
  // own screenings, e.g. supabase.from('screenings').select('*').eq('patient_id', user.id)
  const history = [
    { date: '28 Jul 2026', method: 'Camera gait check', risk: 'mid' },
    { date: '02 May 2026', method: 'Questionnaire only', risk: 'low' },
    { date: '14 Feb 2026', method: 'Camera gait check', risk: 'low' }
  ]

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl m-0">Welcome back, Ripon</h1>
          <div className="text-sm text-ink-soft mt-0.5">Your last screening was 46 days ago</div>
        </div>
        <Link
          to="/dashboard/patient/screen"
          className="inline-block font-semibold text-sm px-4.5 py-2.5 rounded-md bg-primary text-white hover:bg-primary-dark transition-colors no-underline"
        >
          Start new screening
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
        <KpiCard label="Latest risk level" value="Moderate" valueClass="text-risk-mid" />
        <KpiCard label="Screenings done" value="3" />
        <KpiCard label="Knee flexion range" value="108°" />
        <KpiCard label="Days since check-in" value="46" />
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
        <div className="bg-white border border-line rounded-lg p-5">
          <h2 className="text-base mb-3.5">Screening history</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-left font-semibold text-ink-soft text-xs border-b-[1.5px] border-line pb-2">Date</th>
                <th className="text-left font-semibold text-ink-soft text-xs border-b-[1.5px] border-line pb-2">Method</th>
                <th className="text-left font-semibold text-ink-soft text-xs border-b-[1.5px] border-line pb-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.date}>
                  <td className="py-2.5 border-b border-line">{row.date}</td>
                  <td className="py-2.5 border-b border-line">{row.method}</td>
                  <td className="py-2.5 border-b border-line"><RiskPill level={row.risk} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-line rounded-lg p-5">
          <h2 className="text-base mb-3.5">Suggested next step</h2>
          <p className="text-sm">
            Your last result was Moderate. Visiting a health worker for a sensor-based check and x-ray
            review is recommended within the next month.
          </p>
          <a
            href="#"
            className="block text-center mt-2 py-2.5 rounded-md border-[1.5px] border-primary text-primary-dark hover:bg-primary hover:text-white transition-colors no-underline font-semibold text-sm"
          >
            Find nearby health worker
          </a>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, valueClass = 'text-primary-dark' }) {
  return (
    <div className="bg-white border border-line rounded-lg px-4.5 py-4">
      <div className="text-sm text-ink-soft mb-1.5">{label}</div>
      <div className={`font-serif text-2xl font-semibold ${valueClass}`}>{value}</div>
    </div>
  )
}
