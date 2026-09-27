import { Link } from 'react-router-dom'
import RiskPill from '../components/RiskPill.jsx'

export default function WorkerDashboard() {
  // Placeholder data — replace with:
  //   const local = await getAllScreenings()        (Dexie, always available offline)
  //   const remote = await supabase.from('screenings').select('*').eq('camp_id', campId)
  const patients = [
    { name: 'Momita Deb', age: 58, risk: 'high', synced: true },
    { name: 'Bipul Gogoi', age: 61, risk: 'mid', synced: false },
    { name: 'Anjali Rai', age: 49, risk: 'low', synced: true },
    { name: 'D. Marak', age: 66, risk: 'high', synced: false }
  ]

  const referrals = [
    { name: 'Momita Deb', phone: '9876500001', note: 'self-screened High', action: 'Review' },
    { name: 'D. Marak', phone: '9876500002', note: 'self-screened High', action: 'Review' },
    { name: 'Bipul Gogoi', phone: '9876500003', note: 'awaiting x-ray', action: 'Update' }
  ]

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl m-0">Dibrugarh Rural Health Camp</h1>
          <div className="text-sm text-ink-soft mt-0.5">Session started 9:40 AM · 12 Sept 2026</div>
        </div>
        <Link
          to="/dashboard/worker/register"
          className="inline-block font-semibold text-sm px-4.5 py-2.5 rounded-md bg-primary text-white hover:bg-primary-dark transition-colors no-underline"
        >
          Register new patient
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
        <KpiCard label="Screened today" value="18" />
        <KpiCard label="High risk flagged" value="4" valueClass="text-risk-high" />
        <KpiCard label="Pending sync" value="3" valueClass="text-gold" />
        <KpiCard label="Sensor kits active" value="2" />
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
        <div className="bg-white border border-line rounded-lg p-5">
          <h2 className="text-base mb-3.5">Recent patients</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-left font-semibold text-ink-soft text-xs border-b-[1.5px] border-line pb-2">Name</th>
                <th className="text-left font-semibold text-ink-soft text-xs border-b-[1.5px] border-line pb-2">Age</th>
                <th className="text-left font-semibold text-ink-soft text-xs border-b-[1.5px] border-line pb-2">Result</th>
                <th className="text-left font-semibold text-ink-soft text-xs border-b-[1.5px] border-line pb-2">Sync</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.name}>
                  <td className="py-2.5 border-b border-line">{p.name}</td>
                  <td className="py-2.5 border-b border-line">{p.age}</td>
                  <td className="py-2.5 border-b border-line"><RiskPill level={p.risk} /></td>
                  <td className="py-2.5 border-b border-line">
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
                      <span className={`w-1.5 h-1.5 rounded-full ${p.synced ? 'bg-risk-low' : 'bg-gold'}`} />
                      {p.synced ? 'Synced' : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-line rounded-lg p-5">
          <h2 className="text-base mb-3.5">Referral queue</h2>
          <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
            {referrals.map((r) => (
              <li key={r.name} className="flex justify-between items-center border border-line rounded-md px-3 py-2.5 text-sm">
                <span>{r.name} — {r.note}</span>
                <Link
                  to={`/dashboard/worker/register?phone=${r.phone}`}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md bg-primary text-white no-underline"
                >
                  {r.action}
                </Link>
              </li>
            ))}
          </ul>
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
