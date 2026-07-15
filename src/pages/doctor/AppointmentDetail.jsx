// src/pages/doctor/AppointmentDetail.jsx
//
// The unified Appointment Details hub — the central page where a doctor
// completes everything for a visit: Baby Info, Vaccinations (auto-due
// checklist), Laboratory Tests, Medications (structured prescriptions),
// and Doctor Notes. All of it links back to this one appointment.
// A single "Mark Appointment Completed" action closes it out.

import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Baby, User, Calendar, Phone, Mail, Syringe,
  AlertTriangle, Save, FlaskConical, Pill,
  FileText, Trash2, CheckSquare, Plus,
} from 'lucide-react'

import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { appointmentService } from '../../services/appointmentService'
import { infantService }      from '../../services/infantService'
import { vaccinationService } from '../../services/vaccinationService'
import { labTestService, COMMON_LAB_TESTS } from '../../services/labTestService'
import { prescriptionService } from '../../services/prescriptionService'
import { medicalNoteService, VISIT_TYPES } from '../../services/medicalNoteService'
import { directMessageService } from '../../services/directMessageService'
import { buildLabResultsPdf, pdfToFile } from '../../utils/pdfExport'
import { supabase } from '../../supabaseClient'

import Button from '../../components/ui/Button'
import Modal  from '../../components/ui/Modal'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
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

function SectionCard({ icon: Icon, title, subtitle, children, right }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-zinc-800 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Icon size={16} className="text-brand-600" /> {title}
          </h2>
          {subtitle && <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export default function AppointmentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const toast = useToast()

  const [appt, setAppt]     = useState(null)
  const [infant, setInfant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)

  // Vaccinations
  const [dueVaccines, setDueVaccines] = useState([])
  const [checkedVax, setCheckedVax]   = useState({})
  const [vaxNotes, setVaxNotes]       = useState('')
  const [savingVax, setSavingVax]     = useState(false)

  // Lab tests
  const [labTests, setLabTests]         = useState([])
  const [checkedTests, setCheckedTests] = useState({})
  const [customTest, setCustomTest]     = useState('')
  const [customDraft, setCustomDraft]   = useState([]) // custom test names staged before Send
  const [sendingLabs, setSendingLabs]   = useState(false)

  // Medications
  const [medications, setMedications] = useState([])
  const [medForm, setMedForm] = useState({ medication_name: '', dosage: '', frequency: '', duration: '', instructions: '' })
  const [medDraft, setMedDraft] = useState([]) // staged medications, not yet sent
  const [prescribing, setPrescribing] = useState(false)

  // Doctor notes
  const [notes, setNotes] = useState([])
  const [noteForm, setNoteForm] = useState({ visit_type: 'routine', diagnosis: '', content: '', recommendations: '', is_parent_visible: true })
  const [savingNote, setSavingNote] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const a = await appointmentService.getById(id)
      if (!a) throw new Error('Appointment not found.')
      setAppt(a)

      if (a.infant_id) {
        const [inf, due, tests, meds, noteList] = await Promise.all([
          infantService.getById(a.infant_id),
          vaccinationService.dueForInfant(a.infant_id),
          labTestService.listForAppointment(id),
          prescriptionService.listForAppointment(id),
          medicalNoteService.listForAppointment(id),
        ])
        setInfant(inf)
        setDueVaccines(due)
        setCheckedVax(Object.fromEntries(due.map(v => [v.id, true])))
        setLabTests(tests)
        setMedications(meds)
        setNotes(noteList)
      }
    } catch (err) {
      toast.error(err.message ?? 'Could not load this appointment')
    } finally {
      setLoading(false)
    }
  }, [id, toast])

  useEffect(() => { loadAll() }, [loadAll])

  const isDone = appt?.status === 'completed'

  // ── Vaccinations ──────────────────────────────────────────────────
  const toggleVax = (vid) => setCheckedVax(c => ({ ...c, [vid]: !c[vid] }))
  const saveVaccination = async () => {
    const selectedIds = Object.entries(checkedVax).filter(([, v]) => v).map(([k]) => k)
    setSavingVax(true)
    try {
      await vaccinationService.saveVisit({ appointmentId: id, vaccinationIds: selectedIds, doctorId: user.id, notes: vaxNotes })
      const givenNames = dueVaccines.filter(v => checkedVax[v.id]).map(v => `${v.vaccine_name}${v.dose_number ? ` (Dose ${v.dose_number})` : ''}`)
      await vaccinationService.notifyParent({ parentId: appt.parent_id, infantName: infant?.name ?? 'your baby', vaccineNames: givenNames }).catch(() => {})
      toast.success('Vaccination saved')
      await loadAll()
    } catch (err) {
      toast.error(err.message ?? 'Could not save vaccination')
    } finally {
      setSavingVax(false)
    }
  }

  // ── Lab tests ─────────────────────────────────────────────────────
  const toggleTest = (name) => setCheckedTests(c => ({ ...c, [name]: !c[name] }))
  const addCustomTest = () => {
    const name = customTest.trim()
    if (!name) return
    if (customDraft.includes(name)) { toast.error('Already added.'); return }
    setCustomDraft(d => [...d, name])
    setCustomTest('')
  }
  const removeCustomTest = (name) => setCustomDraft(d => d.filter(n => n !== name))

  const sendLabRequest = async () => {
    const testNames = Object.entries(checkedTests).filter(([, v]) => v).map(([k]) => k)
    const allNames = [...testNames, ...customDraft]
    if (allNames.length === 0) {
      toast.error('Select or add at least one test.')
      return
    }
    setSendingLabs(true)
    try {
      const created = await labTestService.requestTests({ appointmentId: id, infantId: infant.id, doctorId: user.id, testNames, customNames: customDraft })
      await labTestService.notifyParent({
        parentId: appt.parent_id, appointmentId: id, infantId: infant.id,
        infantName: infant?.name ?? 'your baby', tests: created,
      }).catch(() => {})
      toast.success(allNames.length === 1 ? 'Lab request sent' : `${allNames.length} lab tests sent in one request`)
      setCheckedTests({}); setCustomTest(''); setCustomDraft([])
      await loadAll()
    } catch (err) {
      toast.error(err.message ?? 'Could not send lab request')
    } finally {
      setSendingLabs(false)
    }
  }
  const [resultModal, setResultModal] = useState(null) // lab test row being resulted, or null
  const [resultNote,  setResultNote]  = useState('')
  const [savingResult, setSavingResult] = useState(false)

  const openResultModal = (test) => { setResultModal(test); setResultNote('') }

  const submitResult = async () => {
    if (!resultModal) return
    if (!resultNote.trim()) { toast.error('Write what the result shows before saving.'); return }
    setSavingResult(true)
    try {
      await labTestService.markReviewed(resultModal.id, resultNote)

      // Re-fetch this appointment's tests fresh — we need to know, right
      // now, whether that was the LAST pending one. Only once every test
      // requested for this visit is reviewed do we send anything — one
      // consolidated PDF covering all of them, not one message per test.
      const freshTests = await labTestService.listForAppointment(id)
      const stillPending = freshTests.some(t => t.status !== 'reviewed')

      if (!stillPending && freshTests.length > 0) {
        try {
          const doc = buildLabResultsPdf({
            infant, appointment: appt, labTests: freshTests,
            doctorName: profile?.full_name,
          })
          const infantSlug = (infant?.name || 'results').replace(/\s+/g, '_')
          const file = pdfToFile(doc, `${infantSlug}_lab_results.pdf`)

          const conversationId = await directMessageService.getOrCreateConversation({
            parentId: appt.parent_id, doctorId: user.id,
          })
          await directMessageService.sendAttachment({
            conversationId, senderId: user.id, file,
          })
          await directMessageService.send({
            conversationId, senderId: user.id,
            content: `I've reviewed all the lab results for ${infant?.name ?? 'your baby'} — see the attached PDF. Let me know if you have any questions!`,
          })

          // Also push a real notification, not just the chat message —
          // reuses the same notification_history -> FCM pipeline already
          // wired up for messages/vaccinations/etc.
          await supabase.from('notification_history').insert({
            user_id: appt.parent_id,
            type: 'lab_results',
            title: `Lab results ready — ${infant?.name ?? 'your baby'}`,
            body: 'All requested tests have been reviewed. Check your messages for the full report.',
            payload: { appointment_id: id },
          }).catch(() => {})

          toast.success('All results reviewed — PDF sent to the mother in chat.')
        } catch (sendErr) {
          // The result itself is already saved at this point — a failed
          // send shouldn't look like the review itself failed.
          toast.error(sendErr.message ?? 'Result saved, but sending the PDF to chat failed — you can try again from the chat tab.')
        }
      } else {
        toast.success('Result saved. Waiting on the remaining test(s) before sending the full report.')
      }

      setResultModal(null); setResultNote('')
      await loadAll()
    } catch (err) {
      toast.error(err.message ?? 'Could not save result')
    } finally {
      setSavingResult(false)
    }
  }

  // ── Medications ───────────────────────────────────────────────────
  const addMedicationToDraft = (e) => {
    e.preventDefault()
    const { medication_name, dosage, frequency, duration } = medForm
    if (!medication_name.trim() || !dosage.trim() || !frequency.trim() || !duration.trim()) {
      toast.error('Fill in name, dosage, frequency, and duration before adding.')
      return
    }
    setMedDraft(d => [...d, { ...medForm, _key: `${Date.now()}_${Math.random()}` }])
    setMedForm({ medication_name: '', dosage: '', frequency: '', duration: '', instructions: '' })
  }
  const removeMedicationDraft = (key) => setMedDraft(d => d.filter(m => m._key !== key))

  const sendMedications = async () => {
    if (medDraft.length === 0) {
      toast.error('Add at least one medication first.')
      return
    }
    setPrescribing(true)
    try {
      const created = await prescriptionService.createBatch({
        appointmentId: id, infantId: infant.id, doctorId: user.id,
        items: medDraft.map(m => ({
          medicationName: m.medication_name, dosage: m.dosage,
          frequency: m.frequency, duration: m.duration, instructions: m.instructions,
        })),
      })
      await prescriptionService.notifyParent({
        parentId: appt.parent_id, infantName: infant?.name ?? 'your baby', medications: created,
      }).catch(() => {})
      toast.success(created.length === 1 ? 'Medication sent' : `${created.length} medications sent in one report`)
      setMedDraft([])
      await loadAll()
    } catch (err) {
      toast.error(err.message ?? 'Could not send medications')
    } finally {
      setPrescribing(false)
    }
  }
  const removeMed = async (medId) => {
    try {
      await prescriptionService.remove(medId)
      toast.success('Medication removed')
      await loadAll()
    } catch (err) {
      toast.error(err.message ?? 'Could not remove')
    }
  }

  // ── Doctor notes ──────────────────────────────────────────────────
  const saveNote = async (e) => {
    e.preventDefault()
    if (!noteForm.content.trim()) { toast.error('Write something first.'); return }
    setSavingNote(true)
    try {
      await medicalNoteService.create({
        doctor_id: user.id, parent_id: appt.parent_id, infant_id: infant.id, appointment_id: id,
        visit_type: noteForm.visit_type, title: VISIT_TYPES.find(v => v.value === noteForm.visit_type)?.label ?? 'Note',
        diagnosis: noteForm.diagnosis,
        content: noteForm.content,
        recommendations: noteForm.recommendations,
        is_parent_visible: noteForm.is_parent_visible,
      })
      toast.success('Note saved')
      setNoteForm({ visit_type: 'routine', diagnosis: '', content: '', recommendations: '', is_parent_visible: true })
      await loadAll()
    } catch (err) {
      toast.error(err.message ?? 'Could not save note')
    } finally {
      setSavingNote(false)
    }
  }

  // ── Complete appointment ─────────────────────────────────────────
  const completeAppointment = async () => {
    setCompleting(true)
    try {
      await appointmentService.setStatus(id, 'completed')
      toast.success('Appointment marked completed')
      await loadAll()
    } catch (err) {
      toast.error(err.message ?? 'Could not complete appointment')
    } finally {
      setCompleting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (!appt) {
    return <EmptyState title="Appointment not found" description="This appointment may have been removed." />
  }

  if (appt.status === 'pending' || appt.status === 'rejected') {
    return (
      <div className="min-h-[60vh] grid place-items-center px-5">
        <div className="max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 grid place-items-center mx-auto mb-4">
            <AlertTriangle size={22} />
          </div>
          <h2 className="font-bold text-slate-900 dark:text-white">
            {appt.status === 'pending' ? "This appointment hasn't been accepted yet" : 'This appointment was rejected'}
          </h2>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-zinc-400">
            {appt.status === 'pending'
              ? 'Accept the request from the Appointments page before opening the visit.'
              : "There's nothing to do here — this request was declined."}
          </p>
          <Button className="mt-5" onClick={() => navigate('/doctor/appointments')}>
            <ArrowLeft size={14} /> Back to appointments
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => navigate('/doctor/appointments')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white mb-5"
      >
        <ArrowLeft size={15} /> Back to appointments
      </button>

      {/* Header: appointment meta + complete action */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-300">
            <Calendar size={15} className="text-slate-400" /> {fmtDateTime(appt.scheduled_at)}
          </div>
          <span className="text-[11px] font-bold uppercase px-1.5 py-0.5 rounded bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
            {(appt.appt_type ?? 'checkup').replace('_', ' ')}
          </span>
          <StatusBadge status={appt.status} />
        </div>
        {!isDone && (
          <Button onClick={completeAppointment} loading={completing} variant="secondary">
            <CheckSquare size={14} /> Mark Appointment Completed
          </Button>
        )}
      </div>

      {/* Baby + parent info */}
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <SectionCard icon={Baby} title="Baby Information">
          <div className="font-bold text-lg text-slate-900 dark:text-white">{infant?.name ?? appt.infant?.name ?? '—'}</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
            {ageLabel(infant?.date_of_birth)} · Born {fmtDate(infant?.date_of_birth)} · {infant?.gender ?? '—'}
          </div>
          {infant?.blood_type && <div className="mt-1 text-sm text-slate-500 dark:text-zinc-400">Blood type: {infant.blood_type}</div>}
        </SectionCard>

        <SectionCard icon={User} title="Parent Information">
          <div className="font-bold text-slate-900 dark:text-white">{appt.parent?.full_name ?? infant?.parent?.full_name ?? '—'}</div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1.5"><Phone size={13} /> {appt.parent?.phone ?? infant?.parent?.phone ?? '—'}</span>
            {infant?.parent?.email && <span className="inline-flex items-center gap-1.5"><Mail size={13} /> {infant.parent.email}</span>}
          </div>
        </SectionCard>
      </div>

      <div className="space-y-4">
        {/* ── Vaccinations ── */}
        <SectionCard icon={Syringe} title="Vaccinations" subtitle="Automatically determined by age — uncheck anything not actually given.">
          {dueVaccines.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-zinc-500">Nothing due right now.</p>
          ) : (
            <>
              <div className="divide-y divide-slate-100 dark:divide-zinc-800 -mx-5 mb-4">
                {dueVaccines.map((v) => {
                  const overdue = v.scheduled_date && v.scheduled_date < new Date().toISOString().slice(0, 10)
                  return (
                    <label key={v.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-zinc-950 cursor-pointer transition">
                      <input type="checkbox" checked={!!checkedVax[v.id]} onChange={() => toggleVax(v.id)} disabled={isDone}
                        className="w-4.5 h-4.5 rounded border-slate-300 text-brand-700 focus:ring-brand-500" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white">{v.vaccine_name}{v.dose_number ? ` — Dose ${v.dose_number}` : ''}</div>
                        <div className="text-xs text-slate-500 dark:text-zinc-500">
                          Due {fmtDate(v.scheduled_date)}
                          {overdue && <span className="ml-2 inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold"><AlertTriangle size={11} /> overdue</span>}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
              <Field label="Notes">
                <Textarea value={vaxNotes} onChange={(e) => setVaxNotes(e.target.value)} placeholder="Reactions, follow-up instructions…" rows={2} disabled={isDone} />
              </Field>
              <div className="mt-3 flex justify-end">
                <Button onClick={saveVaccination} loading={savingVax} disabled={isDone}>
                  <Save size={14} /> Save Vaccination
                </Button>
              </div>
            </>
          )}
        </SectionCard>

        {/* ── Laboratory Tests ── */}
        <SectionCard icon={FlaskConical} title="Laboratory Tests" subtitle="Build the list, then send it as one request.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mb-4">
            {COMMON_LAB_TESTS.map((name) => (
              <label key={name} className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-zinc-200 cursor-pointer">
                <input type="checkbox" checked={!!checkedTests[name]} onChange={() => toggleTest(name)} disabled={isDone}
                  className="w-4 h-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500" />
                {name}
              </label>
            ))}
          </div>
          <Field label="Other (custom) — add as many as you need">
            <div className="flex gap-2">
              <Input
                value={customTest} onChange={(e) => setCustomTest(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTest() } }}
                placeholder="e.g. Thyroid panel" disabled={isDone}
              />
              <Button type="button" variant="secondary" onClick={addCustomTest} disabled={isDone || !customTest.trim()}>
                Add
              </Button>
            </div>
          </Field>

          {customDraft.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {customDraft.map((name) => (
                <span key={name} className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-800 dark:text-brand-200 text-xs font-semibold">
                  {name}
                  <button type="button" onClick={() => removeCustomTest(name)} className="p-0.5 rounded-full hover:bg-brand-100 dark:hover:bg-brand-800/50">
                    <Trash2 size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Button onClick={sendLabRequest} loading={sendingLabs} disabled={isDone}>
              <FlaskConical size={14} /> Send Lab Request
            </Button>
          </div>

          {labTests.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-zinc-800 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-1">Requested for this visit</p>
              {labTests.map((t) => (
                <div key={t.id} className="rounded-xl border border-slate-100 dark:border-zinc-800 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-700 dark:text-zinc-200">{t.test_name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {t.status === 'reviewed'
                        ? <StatusBadge status="reviewed" />
                        : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">Waiting for result</span>}
                      {t.status !== 'reviewed' && (
                        <Button variant="ghost" size="xs" onClick={() => openResultModal(t)}>Result received</Button>
                      )}
                    </div>
                  </div>
                  {t.status === 'reviewed' && t.doctor_notes && (
                    <div className="mt-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 px-3 py-2 text-xs text-blue-800 dark:text-blue-300">
                      {t.doctor_notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── Medications ── */}
        <SectionCard icon={Pill} title="Medications" subtitle="Add each one to the list, then send them all together.">
          <form onSubmit={addMedicationToDraft} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Medication name" required>
              <Input value={medForm.medication_name} onChange={(e) => setMedForm(f => ({ ...f, medication_name: e.target.value }))} placeholder="Amoxicillin Syrup" disabled={isDone || prescribing} />
            </Field>
            <Field label="Dosage" required>
              <Input value={medForm.dosage} onChange={(e) => setMedForm(f => ({ ...f, dosage: e.target.value }))} placeholder="5 mL" disabled={isDone || prescribing} />
            </Field>
            <Field label="Frequency" required>
              <Input value={medForm.frequency} onChange={(e) => setMedForm(f => ({ ...f, frequency: e.target.value }))} placeholder="Twice Daily" disabled={isDone || prescribing} />
            </Field>
            <Field label="Duration" required>
              <Input value={medForm.duration} onChange={(e) => setMedForm(f => ({ ...f, duration: e.target.value }))} placeholder="7 Days" disabled={isDone || prescribing} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Instructions">
                <Textarea value={medForm.instructions} onChange={(e) => setMedForm(f => ({ ...f, instructions: e.target.value }))} placeholder="Take after meals." rows={2} disabled={isDone || prescribing} />
              </Field>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" variant="secondary" disabled={isDone || prescribing}>
                <Plus size={14} /> Add to List
              </Button>
            </div>
          </form>

          {medDraft.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-1">
                Ready to send ({medDraft.length})
              </p>
              {medDraft.map((m) => (
                <div key={m._key} className="flex items-start justify-between gap-3 rounded-xl bg-brand-50/60 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-900/40 p-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white">{m.medication_name}</div>
                    <div className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">{m.dosage} · {m.frequency} · {m.duration}</div>
                    {m.instructions && <div className="text-xs text-slate-500 dark:text-zinc-500 mt-1">{m.instructions}</div>}
                  </div>
                  <button type="button" onClick={() => removeMedicationDraft(m._key)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div className="flex justify-end pt-1">
                <Button onClick={sendMedications} loading={prescribing} disabled={isDone}>
                  <Pill size={14} /> Send {medDraft.length === 1 ? 'Medication' : `${medDraft.length} Medications`}
                </Button>
              </div>
            </div>
          )}

          {medications.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-zinc-800 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Prescribed this visit</p>
              {medications.map((m) => (
                <div key={m.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 dark:bg-zinc-950 p-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white">{m.medication_name}</div>
                    <div className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">{m.dosage} · {m.frequency} · {m.duration}</div>
                    {m.instructions && <div className="text-xs text-slate-500 dark:text-zinc-500 mt-1">{m.instructions}</div>}
                  </div>
                  <button onClick={() => removeMed(m.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── Doctor Notes ── */}
        <SectionCard icon={FileText} title="Doctor Notes">
          <form onSubmit={saveNote} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Visit type">
                <Select value={noteForm.visit_type} onChange={(e) => setNoteForm(f => ({ ...f, visit_type: e.target.value }))} disabled={isDone || savingNote}>
                  {VISIT_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                </Select>
              </Field>
              <Field label="Diagnosis (optional)">
                <Input value={noteForm.diagnosis} onChange={(e) => setNoteForm(f => ({ ...f, diagnosis: e.target.value }))} placeholder="e.g. URTI" disabled={isDone || savingNote} />
              </Field>
            </div>
            <Field label="Note">
              <Textarea value={noteForm.content} onChange={(e) => setNoteForm(f => ({ ...f, content: e.target.value }))} placeholder="Findings, observations…" rows={4} disabled={isDone || savingNote} />
            </Field>
            <Field label="Recommendations (optional)">
              <Textarea value={noteForm.recommendations} onChange={(e) => setNoteForm(f => ({ ...f, recommendations: e.target.value }))} placeholder="Follow-up actions, advice for the parent…" rows={2} disabled={isDone || savingNote} />
            </Field>

            <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-slate-200 dark:border-zinc-800 p-3 hover:bg-slate-50 dark:hover:bg-zinc-950 transition-colors">
              <div
                onClick={() => !isDone && !savingNote && setNoteForm(f => ({ ...f, is_parent_visible: !f.is_parent_visible }))}
                className={`relative w-9 h-5 rounded-full transition-colors ${noteForm.is_parent_visible ? 'bg-brand-600' : 'bg-slate-300 dark:bg-zinc-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${noteForm.is_parent_visible ? 'left-4' : 'left-0.5'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {noteForm.is_parent_visible ? 'Visible to parent' : 'Hidden from parent'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-zinc-500">
                  {noteForm.is_parent_visible ? 'Parent can read this in the app' : 'Private — only you and admins can see it'}
                </p>
              </div>
            </label>

            <div className="flex justify-end">
              <Button type="submit" loading={savingNote} disabled={isDone}>
                <Save size={14} /> Save Note
              </Button>
            </div>
          </form>

          {notes.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-zinc-800 space-y-3">
              {notes.map((n) => (
                <div key={n.id} className="rounded-xl bg-slate-50 dark:bg-zinc-950 p-3">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[11px] font-bold uppercase text-brand-700 dark:text-brand-300">{n.title}</span>
                    <span className="text-[11px] text-slate-400">{fmtDate(n.created_at)}</span>
                    {n.is_parent_visible === false && (
                      <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-600">· Private</span>
                    )}
                  </div>
                  {n.diagnosis && <p className="text-xs text-slate-500 dark:text-zinc-500 mb-1">Dx: {n.diagnosis}</p>}
                  <p className="text-sm text-slate-700 dark:text-zinc-200 whitespace-pre-line">{n.content}</p>
                  {n.recommendations && (
                    <div className="mt-2 rounded-lg bg-brand-50 dark:bg-zinc-900 border-l-[3px] border-brand-500 dark:border-zinc-600 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-brand-700 dark:text-zinc-400 mb-0.5">Recommendations</div>
                      <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">{n.recommendations}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Enter lab result — writes doctor_notes on the test and notifies the mother */}
      <Modal
        open={!!resultModal}
        onClose={() => !savingResult && setResultModal(null)}
        title={resultModal ? `Result — ${resultModal.test_name}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResultModal(null)} disabled={savingResult}>Cancel</Button>
            <Button onClick={submitResult} loading={savingResult}>Save & notify mother</Button>
          </>
        }
      >
        <Field label="What does the result show?" required>
          <Textarea
            value={resultNote}
            onChange={(e) => setResultNote(e.target.value)}
            placeholder="e.g. Hemoglobin within normal range, no action needed."
            rows={4}
            disabled={savingResult}
          />
        </Field>
        <p className="text-xs text-slate-500 dark:text-zinc-500 mt-2">
          This note is sent directly to the mother as a notification, so write it the way you'd want a parent to read it.
        </p>
      </Modal>
    </>
  )
}