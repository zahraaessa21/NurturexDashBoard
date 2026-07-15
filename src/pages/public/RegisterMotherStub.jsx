// src/pages/public/RegisterMotherStub.jsx
//
// Mothers register and use NurtureX through the Flutter mobile app, not
// this dashboard. This page just points them there clearly.

import { useNavigate } from 'react-router-dom'
import { Smartphone, ArrowLeft } from 'lucide-react'
import Logo from '../../components/Logo'
import Button from '../../components/ui/Button'

export default function RegisterMotherStub() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-slate-50 grid place-items-center px-5">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-100 shadow-card p-8 text-center">
        <Logo size={40} className="mx-auto mb-4" />
        <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-700 grid place-items-center mx-auto mb-4">
          <Smartphone size={26} />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Get the NurtureX App</h1>
        <p className="mt-2 text-sm text-slate-500">
          Mothers track vitals, feeding, sleep, and connect with their doctor through the NurtureX mobile app. Download links coming soon.
        </p>
        <Button variant="secondary" className="mt-6" onClick={() => navigate('/')}>
          <ArrowLeft size={16} className="mr-1.5" /> Back to Home
        </Button>
      </div>
    </div>
  )
}
