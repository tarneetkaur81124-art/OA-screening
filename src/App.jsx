import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import DashboardLayout from './pages/DashboardLayout.jsx'
import PatientDashboard from './pages/PatientDashboard.jsx'
import PatientQuestionnaire from './pages/PatientQuestionnaire.jsx'
import GaitCapture from './pages/GaitCapture.jsx'
import PatientXrayUpload from './pages/PatientXrayUpload.jsx'
import RegisterPatient from './pages/RegisterPatient.jsx'
import WorkerAssessment from './pages/WorkerAssessment.jsx'
import WorkerDashboard from './pages/WorkerDashboard.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />

      {/* Shared sidebar/topbar shell, role-specific content nested inside */}
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<Navigate to="patient" replace />} />
        <Route path="patient" element={<PatientDashboard />} />
        <Route path="patient/screen" element={<PatientQuestionnaire />} />
        <Route path="patient/gait-check" element={<GaitCapture />} />
        <Route path="patient/xray-upload" element={<PatientXrayUpload />} />
        {/* Same two components, reused for a worker filling them out on behalf of
            a brand-new patient who has no prior home self-screening to reuse. */}
        <Route path="worker/intake/questionnaire" element={<PatientQuestionnaire />} />
        <Route path="worker/intake/gait" element={<GaitCapture />} />
        <Route path="worker" element={<WorkerDashboard />} />
        <Route path="worker/register" element={<RegisterPatient />} />
        <Route path="worker/assess" element={<WorkerAssessment />} />
      </Route>
    </Routes>
  )
}
