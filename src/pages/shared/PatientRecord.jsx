// src/pages/shared/PatientRecord.jsx
//
// Doctor's view of a mother. Per supervisor feedback, this no longer
// exposes the mother's personal health tracking (vitals, mood, breastfeeding,
// medications, postpartum checkups) to the doctor — only what a doctor
// actually needs: her general contact info, and her infants (which the
// doctor treats).

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Mail, Phone, Baby, ChevronRight, Stethoscope } from 'lucide-react'

import { useToast } from '../../hooks/useToast'
import { patientService } from '../../services/patientService'

import Avatar      from '../../components/ui/Avatar'
import Button      from '../../components/ui/Button'
import StatusBadge from '../../components/StatusBadge'
import EmptyState  from '../../components/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function ageLabel(dob) {
  if (!dob) return '—'
  const months = Math.floor((Date.now() - new Date(dob).getTime()) / (30.4375 * 24 * 3600 * 1000))
  if (months < 1) return 'Newborn'
  if (months < 24) return `${months} mo`
  return `${Math.floor(months / 12)} yr`
}

export default function PatientRecord() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [patient, setPatient] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    patientService.getById(id)
      .then((p) => { if (!cancelled) setPatient(p) })
      .catch((err) => { if (!cancelled) toast.error(err.message ?? 'Could not load patient record') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, toast])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (!patient) {
    return <EmptyState title="Patient not found" description="This record may have been removed." />
  }

  return (
    <>
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white mb-5"
      >
        <ArrowLeft size={15} /> Back
      </button>

      {/* Mother — general info only */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-6 mb-6">
        <div className="flex items-center gap-4">
          <Avatar src={patient.avatar_url} name={patient.full_name} size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate">{patient.full_name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1.5"><Mail size={14} /> {patient.email ?? '—'}</span>
              <span className="inline-flex items-center gap-1.5"><Phone size={14} /> {patient.phone ?? '—'}</span>
            </div>
          </div>
          <StatusBadge status={patient.status ?? 'active'} />
        </div>
        {patient.doctor?.full_name && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800 text-sm text-slate-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
            <Stethoscope size={14} /> Assigned to Dr. {patient.doctor.full_name}
          </div>
        )}
      </div>

      {/* Her infants */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-zinc-800">
          <h2 className="font-bold text-slate-900 dark:text-white">Infants</h2>
        </div>

        {(!patient.infants || patient.infants.length === 0) ? (
          <EmptyState icon={Baby} title="No infants on record" description="This mother has no infants registered yet." />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {patient.infants.map((b) => (
              <button
                key={b.id}
                onClick={() => navigate(`/doctor/infants/${b.id}`)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-zinc-950 transition text-left"
              >
                <div className="w-10 h-10 rounded-full bg-brand-50 dark:bg-zinc-800 text-brand-700 dark:text-white grid place-items-center shrink-0">
                  <Baby size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white">{b.name}</div>
                  <div className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">
                    {ageLabel(b.date_of_birth)} · Born {fmtDate(b.date_of_birth)} · {b.gender ?? '—'}
                  </div>
                </div>
                <StatusBadge status={b.status} />
                <ChevronRight size={16} className="text-slate-300 dark:text-zinc-700" />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
