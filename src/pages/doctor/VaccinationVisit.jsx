// src/pages/doctor/VaccinationVisit.jsx
//
// Reached from a vaccination-type appointment. Shows the baby + parent
// info, then an AUTO-GENERATED checklist of vaccines due for this infant's
// age (from the vaccine_schedule → vaccinations pipeline — see
// sql/2026-07-vaccination-automation.sql). The doctor never picks vaccines
// from a full list; they only confirm which of the suggested ones were
// actually given.

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Baby, User, Calendar, Phone, Mail, Syringe,
  CheckCircle2, AlertTriangle, Save,
} from 'lucide-react'

import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { appointmentService } from '../../services/appointmentService'
import { infantService }      from '../../services/infantService'
import { vaccinationService } from '../../services/vaccinationService'

import Button from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Field'
import StatusBadge from '../../components/StatusBadge'
import EmptyState  from '../../components/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'

function fmtDateTime(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
function ageLabel(dob) {
  if (!dob) return '—'
  const months = Math.floor((Date.now() - new Date(dob).getTime()) / (30.4375 * 24 * 3600 * 1000))
  if (months < 1) return 'Newborn'
  if (months < 24) return `${months} mo`
  return `${Math.floor(months / 12)} yr ${months % 12} mo`
}

export default function VaccinationVisit() {
  const { id } = useParams() // appointment id
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()

  const [appt, setAppt]   = useState(null)
  const [infant, setInfant] = useState(null)
  const [due, setDue]     = useState([])
  const [checked, setChecked] = useState({})
  const [notes, setNotes] = useState('')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const a = await appointmentService.getById(id)
        if (!a) throw new Error('Appointment not found.')
        if (cancelled) return
        setAppt(a)

        if (a.infant_id) {
          const [inf, dueList] = await Promise.all([
            infantService.getById(a.infant_id),
            vaccinationService.dueForInfant(a.infant_id),
          ])
          if (cancelled) return
          setInfant(inf)
          setDue(dueList)
          // Default: everything due is pre-checked (doctor unchecks what wasn't given).
          setChecked(Object.fromEntries(dueList.map(v => [v.id, true])))
        }
      } catch (err) {
        toast.error(err.message ?? 'Could not load this visit')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id, toast])

  const toggle = (vid) => setChecked(c => ({ ...c, [vid]: !c[vid] }))

  const save = async () => {
    const selectedIds = Object.entries(checked).filter(([, v]) => v).map(([k]) => k)
    setSaving(true)
    try {
      await vaccinationService.saveVisit({
        appointmentId: id,
        vaccinationIds: selectedIds,
        doctorId: user.id,
        notes,
      })

      const givenNames = due.filter(v => checked[v.id]).map(v => `${v.vaccine_name}${v.dose_number ? ` (Dose ${v.dose_number})` : ''}`)
      await vaccinationService.notifyParent({
        parentId: appt.parent_id,
        infantName: infant?.name ?? 'your baby',
        vaccineNames: givenNames,
      }).catch(() => {}) // notification failure shouldn't block the save

      toast.success('Vaccination visit saved')
      navigate('/doctor/appointments')
    } catch (err) {
      toast.error(err.message ?? 'Could not save this visit')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  if (!appt) {
    return <EmptyState title="Appointment not found" description="This appointment may have been removed." />
  }

  const alreadyCompleted = appt.status === 'completed'

  return (
    <>
      <button
        onClick={() => navigate('/doctor/appointments')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white mb-5"
      >
        <ArrowLeft size={15} /> Back to appointments
      </button>

      {/* Baby + parent + appointment info */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-3 flex items-center gap-1.5">
            <Baby size={13} /> Baby information
          </h3>
          <div className="font-bold text-lg text-slate-900 dark:text-white">{infant?.name ?? appt.infant?.name ?? '—'}</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
            {ageLabel(infant?.date_of_birth)} · Born {fmtDate(infant?.date_of_birth)}
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-3 flex items-center gap-1.5">
            <User size={13} /> Parent information
          </h3>
          <div className="font-bold text-slate-900 dark:text-white">{appt.parent?.full_name ?? infant?.parent?.full_name ?? '—'}</div>
          <div className="mt-1.5 space-y-1 text-sm text-slate-500 dark:text-zinc-400">
            <div className="inline-flex items-center gap-1.5"><Phone size={13} /> {appt.parent?.phone ?? infant?.parent?.phone ?? '—'}</div>
            {infant?.parent?.email && (
              <div className="inline-flex items-center gap-1.5 ml-4"><Mail size={13} /> {infant.parent.email}</div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-300">
          <Calendar size={15} className="text-slate-400" /> {fmtDateTime(appt.scheduled_at)}
        </div>
        <StatusBadge status={appt.status} />
      </div>

      {/* Auto checklist */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-zinc-800">
          <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Syringe size={16} className="text-brand-600" /> Vaccines due for this visit
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">
            Automatically determined by {infant?.name ?? 'the infant'}'s age. Uncheck anything that wasn't actually given.
          </p>
        </div>

        {due.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nothing due right now" description="This infant has no vaccines currently due." />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {due.map((v) => {
              const overdue = v.scheduled_date && v.scheduled_date < new Date().toISOString().slice(0, 10)
              return (
                <label key={v.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-zinc-950 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={!!checked[v.id]}
                    onChange={() => toggle(v.id)}
                    disabled={alreadyCompleted}
                    className="w-4.5 h-4.5 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {v.vaccine_name}{v.dose_number ? ` — Dose ${v.dose_number}` : ''}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-zinc-500">
                      Due {fmtDate(v.scheduled_date)}
                      {overdue && (
                        <span className="ml-2 inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
                          <AlertTriangle size={11} /> overdue
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}

        <div className="p-5 border-t border-slate-200 dark:border-zinc-800">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2 block">Notes</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reactions, follow-up instructions, anything worth recording…"
            rows={3}
            disabled={alreadyCompleted}
          />

          <div className="mt-4 flex justify-end">
            {alreadyCompleted ? (
              <span className="text-sm text-slate-500 dark:text-zinc-500 inline-flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-emerald-600" /> This visit is already completed.
              </span>
            ) : (
              <Button onClick={save} loading={saving} disabled={due.length === 0}>
                <Save size={14} /> Save Vaccination
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
