// src/App.jsx
//
// Routing for the two-role system: admin + doctor.
//
// BrowserRouter + Vercel's SPA rewrite (see vercel.json) gives clean URLs
// like https://<you>.vercel.app/admin/doctors that survive page reloads.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

// Public
import Home from './pages/public/Home'
import DoctorRegister from './pages/public/DoctorRegister'
import RegisterMotherStub from './pages/public/RegisterMotherStub'

// Auth
import AuthPage from './pages/auth/AuthPage'

// Layout + Guards
import DashboardLayout from './components/DashboardLayout'
import ProtectedRoute  from './components/ProtectedRoute'

// Admin pages
import AdminDashboard    from './pages/admin/AdminDashboard'
import AdminDoctors      from './pages/admin/AdminDoctors'
import AdminDoctorApplications from './pages/admin/AdminDoctorApplications'
import AdminInfants      from './pages/admin/AdminInfants'
import AdminAppointments from './pages/admin/AdminAppointments'
import AdminReports      from './pages/admin/AdminReports'
import AdminVaccineSchedule from './pages/admin/AdminVaccineSchedule'
import AdminProfile      from './pages/admin/AdminProfile'

// Doctor pages
import DoctorDashboard     from './pages/doctor/DoctorDashboard'
import DoctorInfants       from './pages/doctor/DoctorInfants'
import DoctorAppointments  from './pages/doctor/DoctorAppointments'
import DoctorVaccinations  from './pages/doctor/DoctorVaccinations'
import DoctorMessages      from './pages/doctor/DoctorMessages'
import DoctorMedicalNotes from './pages/doctor/DoctorMedicalNotes'
import DoctorProfile       from './pages/doctor/DoctorProfile'
import AppointmentDetail    from './pages/doctor/AppointmentDetail'

// Shared (used by both admin and doctor routes)
import AlertsPage         from './pages/shared/AlertsPage'
import InfantDetail       from './pages/shared/InfantDetail'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public marketing site */}
        <Route path="/" element={<Home />} />
        <Route path="/register/doctor" element={<DoctorRegister />} />
        <Route path="/register/mother" element={<RegisterMotherStub />} />
        <Route path="/auth" element={<AuthPage />} />

        {/* ── Admin panel ── */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="admin">
              <DashboardLayout title="Admin Panel" />
            </ProtectedRoute>
          }
        >
          <Route index               element={<AdminDashboard />} />
          <Route path="doctors"      element={<AdminDoctors />} />
          <Route path="doctor-applications" element={<AdminDoctorApplications />} />
          <Route path="infants"      element={<AdminInfants />} />
          <Route path="infants/:id"  element={<InfantDetail />} />
          <Route path="appointments" element={<AdminAppointments />} />
          <Route path="reports"      element={<AdminReports />} />
          <Route path="vaccine-schedule" element={<AdminVaccineSchedule />} />
          <Route path="profile"      element={<AdminProfile />} />
        </Route>

        {/* ── Doctor panel ── */}
        <Route
          path="/doctor"
          element={
            <ProtectedRoute requiredRole="doctor">
              <DashboardLayout title="Doctor Panel" />
            </ProtectedRoute>
          }
        >
          <Route index                 element={<DoctorDashboard />} />
          <Route path="infants"        element={<DoctorInfants />} />
          <Route path="infants/:id"    element={<InfantDetail />} />
          <Route path="appointments"   element={<DoctorAppointments />} />
          <Route path="vaccinations"   element={<DoctorVaccinations />} />
          <Route path="appointments/:id" element={<AppointmentDetail />} />
          <Route path="messages"       element={<DoctorMessages />} />
          <Route path="medical-notes"   element={<DoctorMedicalNotes />} />
          <Route path="alerts"         element={<AlertsPage />} />
          <Route path="profile"        element={<DoctorProfile />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}