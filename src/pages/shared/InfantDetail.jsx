// src/pages/shared/InfantDetail.jsx
//
// Shared infant detail view used by both admin and doctor routes.
// Tabs: Overview, Growth (chart), Vaccinations, Feeding.

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Activity, Syringe, Utensils, Plus, Check, Trash2, AlertCircle,
  FileText, History, Calendar, FlaskConical, Pill, CheckCircle2, RefreshCw,
  FileDown, Loader2,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { saveAs } from 'file-saver'

import { useAuth }  from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { infantService }       from '../../services/infantService'
import { growthService }       from '../../services/growthService'
import { vaccinationService }  from '../../services/vaccinationService'
import { feedingService }      from '../../services/feedingService'
import { medicalNoteService }  from '../../services/medicalNoteService'
import { appointmentService }  from '../../services/appointmentService'
import { labTestService }      from '../../services/labTestService'
import { prescriptionService } from '../../services/prescriptionService'
import { buildInfantRecordPdf, pdfToFile } from '../../utils/pdfExport'

import Avatar      from '../../components/ui/Avatar'
import Button      from '../../components/ui/Button'
import Modal       from '../../components/ui/Modal'
import { Field, Input } from '../../components/ui/Field'
import StatusBadge from '../../components/StatusBadge'
import EmptyState  from '../../components/EmptyState'
import { Skeleton, SkeletonStatCard } from '../../components/ui/Skeleton'
import { cn } from '../../utils/cn'

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const TABS = [
  { key: 'overview',     label: 'Overview',     icon: Activity },
  { key: 'growth',       label: 'Growth',       icon: Activity },
  { key: 'vaccinations', label: 'Vaccinations', icon: Syringe },
  { key: 'feeding',      label: 'Feeding',      icon: Utensils },
  { key: 'labs',         label: 'Lab Tests',    icon: FlaskConical },
  { key: 'medications',  label: 'Medications',  icon: Pill },
  { key: 'history',      label: 'Medical History', icon: History },
]

export default function InfantDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { isAdmin } = useAuth()
  const back = isAdmin ? '/admin/infants' : '/doctor/infants'

  const [tab,    setTab]    = useState('overview')
  const [regenerating, setRegenerating] = useState(false)
  const [historyFilter, setHistoryFilter] = useState('all')
  const [labSearch, setLabSearch] = useState('')
  const [labFrom,   setLabFrom]   = useState('')
  const [labTo,     setLabTo]     = useState('')
  const [medSearch, setMedSearch] = useState('')
  const [medFrom,   setMedFrom]   = useState('')
  const [medTo,     setMedTo]     = useState('')
  const [infant, setInfant] = useState(null)
  const [loading, setLoading] = useState(true)

  const [growth,       setGrowth]       = useState([])
  const [vaccinations, setVaccinations] = useState([])
  const [feedings,     setFeedings]     = useState([])
  const [notes,        setNotes]        = useState([])
  const [appointments, setAppointments] = useState([])
  const [labTests,     setLabTests]     = useState([])
  const [medications,  setMedications]  = useState([])
  const [downloading,  setDownloading]  = useState(false)

  // Modals
  const [growthModal,  setGrowthModal]  = useState(false)
  const [vaxModal,     setVaxModal]     = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [i, g, v, f, n, apptRes, tests, meds] = await Promise.all([
          infantService.getById(id),
          growthService.listForInfant(id),
          vaccinationService.listForInfant(id),
          feedingService.listForInfant(id),
          medicalNoteService.listForInfant(id),
          appointmentService.list({ infantId: id, status: 'all', pageSize: 200 }),
          labTestService.listForInfant(id),
          prescriptionService.listForInfant(id),
        ])
        if (cancelled) return
        setInfant(i)
        setGrowth(g)
        setVaccinations(v)
        setFeedings(f)
        setNotes(n)
        setAppointments(apptRes.rows ?? [])
        setLabTests(tests)
        setMedications(meds)
      } catch (err) {
        if (!cancelled) toast.error(err.message ?? 'Could not load infant')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id, toast])

  if (loading) {
    return (
      <>
        <Skeleton className="h-10 w-32 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard />
        </div>
        <Skeleton className="h-96 w-full" />
      </>
    )
  }
  if (!infant) {
    return (
      <EmptyState title="Infant not found" description="The record may have been deleted or you don't have access." />
    )
  }

  const ageMonths = infant.date_of_birth
    ? Math.max(0, Math.floor((Date.now() - new Date(infant.date_of_birth)) / (30 * 86400000)))
    : null

  const latestGrowth = growth[growth.length - 1]
  const upcomingVax  = vaccinations.filter(v => v.status === 'scheduled').length
  const overdueVax   = vaccinations.filter(v => v.status === 'overdue').length

  const refreshGrowth = async () => setGrowth(await growthService.listForInfant(id))
  const refreshVax    = async () => setVaccinations(await vaccinationService.listForInfant(id))
  const refreshFeeds  = async () => setFeedings(await feedingService.listForInfant(id))
  const refreshNotes  = async () => setNotes(await medicalNoteService.listForInfant(id))

  const handleDownloadRecord = async () => {
    setDownloading(true)
    try {
      const doc = buildInfantRecordPdf({ infant, growth, vaccinations, labTests, medications })
      const file = pdfToFile(doc, `${(infant.name || 'infant').replace(/\s+/g, '_')}_record.pdf`)
      saveAs(file, file.name)
    } catch (err) {
      toast.error(err.message ?? 'Could not generate the record.')
    } finally {
      setDownloading(false)
    }
  }

  // ── Unified medical history: every event, chronological, read-only.
  // Pulls together appointments, vaccinations, lab tests, medications,
  // and notes — everything that happened for this infant, linked back to
  // whichever appointment it happened during.
  const historyEvents = [
    ...appointments
      .filter(a => a.status === 'completed')
      .map(a => ({
        date: a.scheduled_at,
        icon: Calendar,
        color: 'brand',
        category: 'appointment',
        label: `Appointment completed`,
        detail: (a.appt_type ?? 'checkup').replace('_', ' '),
        appointmentId: a.id,
      })),
    ...vaccinations
      .filter(v => v.status === 'administered' && v.administered_date)
      .map(v => ({
        date: v.administered_date,
        icon: Syringe,
        color: 'emerald',
        category: 'vaccination',
        label: 'Vaccination administered',
        detail: `${v.vaccine_name}${v.dose_number ? ` — Dose ${v.dose_number}` : ''}`,
        appointmentId: v.appointment_id,
      })),
    ...labTests.map(t => ({
      date: t.requested_at,
      icon: FlaskConical,
      color: 'amber',
      category: 'lab',
      label: 'Laboratory test requested',
      detail: t.test_name,
      appointmentId: t.appointment_id,
    })),
    ...labTests
      .filter(t => t.status === 'reviewed' && t.reviewed_at)
      .map(t => ({
        date: t.reviewed_at,
        icon: CheckCircle2,
        color: 'blue',
        category: 'lab',
        label: 'Laboratory result reviewed',
        detail: t.test_name,
        appointmentId: t.appointment_id,
      })),
    ...medications.map(m => ({
      date: m.created_at,
      icon: Pill,
      color: 'purple',
      category: 'medication',
      label: 'Medication prescribed',
      detail: `${m.medication_name} — ${m.dosage}, ${m.frequency}`,
      appointmentId: m.appointment_id,
    })),
    ...notes.map(n => ({
      date: n.created_at,
      icon: FileText,
      color: 'slate',
      category: 'note',
      label: n.title || 'Doctor note',
      detail: n.content?.slice(0, 80),
      appointmentId: n.appointment_id,
    })),
  ]
    .filter(e => e.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  const HISTORY_COLORS = {
    brand:   'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    amber:   'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    blue:    'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
    purple:  'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
    slate:   'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400',
  }

  const HISTORY_CATEGORIES = [
    { key: 'all',         label: 'All',          icon: History },
    { key: 'appointment', label: 'Appointments', icon: Calendar },
    { key: 'vaccination', label: 'Vaccinations', icon: Syringe },
    { key: 'lab',         label: 'Lab Tests',    icon: FlaskConical },
    { key: 'medication',  label: 'Medications',  icon: Pill },
    { key: 'note',        label: 'Notes',        icon: FileText },
  ]

  return (
    <>
      <button
        onClick={() => navigate(back)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white mb-5 transition"
      >
        <ArrowLeft size={15} /> Back to infants
      </button>

      {/* Identity card */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5 sm:p-6 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Avatar name={infant.name} size="xl" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{infant.name}</h1>
            <div className="text-sm text-slate-500 dark:text-zinc-500 mt-0.5">
              {ageMonths != null ? `${ageMonths} months old` : 'DOB unknown'}
              {' · '}{infant.gender ?? '—'}
              {infant.blood_type ? ` · ${infant.blood_type}` : ''}
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <StatusBadge status={infant.status} />
              {infant.mother?.full_name && (
                <span className="text-xs text-slate-500 dark:text-zinc-500">Mother: <span className="font-semibold text-slate-700 dark:text-zinc-300">{infant.mother.full_name}</span></span>
              )}
              {infant.doctor?.full_name && (
                <span className="text-xs text-slate-500 dark:text-zinc-500">Doctor: <span className="font-semibold text-slate-700 dark:text-zinc-300">Dr. {infant.doctor.full_name}</span></span>
              )}
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={handleDownloadRecord} disabled={downloading} className="shrink-0">
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            {downloading ? 'Generating…' : 'Download Record (PDF)'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex items-center gap-2 px-4 h-10 rounded-lg text-sm font-semibold whitespace-nowrap transition',
                active
                  ? 'bg-brand-700 text-white dark:bg-white dark:text-black'
                  : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-900'
              )}
            >
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <StatTile label="Age" value={ageMonths != null ? `${ageMonths} mo` : '—'} />
          <StatTile label="Weight" value={latestGrowth?.weight_kg ? `${latestGrowth.weight_kg} kg` : '—'} sub={latestGrowth ? `last: ${new Date(latestGrowth.measured_at).toLocaleDateString()}` : 'no records'} />
          <StatTile label="Height" value={latestGrowth?.height_cm ? `${latestGrowth.height_cm} cm` : '—'} />
          <StatTile label="Vaccinations done" value={vaccinations.filter(v => v.status === 'administered').length} />
          <StatTile label="Upcoming" value={upcomingVax} sub={overdueVax ? `${overdueVax} overdue` : null} />
          <StatTile label="Recent feedings" value={feedings.length} sub={feedings[0] ? `last: ${new Date(feedings[0].fed_at).toLocaleString()}` : null} />
          {infant.notes && (
            <div className="lg:col-span-3 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5">
              <h3 className="font-bold text-slate-900 dark:text-white mb-2">Notes</h3>
              <p className="text-sm text-slate-600 dark:text-zinc-300 leading-relaxed whitespace-pre-line">{infant.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Growth ── */}
      {tab === 'growth' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Growth chart</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-500">Weight & height over time</p>
              </div>
              <Button size="sm" onClick={() => setGrowthModal(true)}><Plus size={13} /> Add measurement</Button>
            </div>
            {growth.length === 0 ? (
              <EmptyState icon={Activity} title="No measurements yet" description="Add the first growth record to see the chart." />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={growth.map(g => ({ ...g, label: new Date(g.measured_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }))} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-zinc-800" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'currentColor' }} className="text-slate-500 dark:text-zinc-500" axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} className="text-slate-500 dark:text-zinc-500" axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,.08)', fontSize: 12, background: 'var(--surface)', color: 'var(--text-primary)' }} />
                    <Legend />
                    <Line type="monotone" dataKey="weight_kg" name="Weight (kg)" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="height_cm" name="Height (cm)" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Records table */}
          {growth.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-zinc-950">
                    <tr>
                      <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Date</th>
                      <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Weight</th>
                      <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Height</th>
                      <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Head</th>
                      <th className="text-right px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {[...growth].reverse().map(g => (
                      <tr key={g.id} className="hover:bg-slate-50 dark:hover:bg-zinc-950">
                        <td className="px-5 py-3">{new Date(g.measured_at).toLocaleDateString()}</td>
                        <td className="px-5 py-3">{g.weight_kg ? `${g.weight_kg} kg` : '—'}</td>
                        <td className="px-5 py-3">{g.height_cm ? `${g.height_cm} cm` : '—'}</td>
                        <td className="px-5 py-3">{g.head_circumference ? `${g.head_circumference} cm` : '—'}</td>
                        <td className="px-5 py-3 text-right">
                          <Button variant="danger" size="xs" onClick={async () => {
                            await growthService.remove(g.id)
                            toast.success('Record deleted')
                            refreshGrowth()
                          }}>
                            <Trash2 size={12} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Vaccinations ── */}
      {tab === 'vaccinations' && (
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-5 flex items-center justify-between border-b border-slate-200 dark:border-zinc-800">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Vaccinations</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-500">Schedule and administration record.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm" variant="secondary"
                disabled={!infant?.date_of_birth || regenerating}
                title={!infant?.date_of_birth ? 'Add a date of birth first' : 'Fill in any vaccines missing from the master schedule'}
                onClick={async () => {
                  setRegenerating(true)
                  try {
                    const added = await vaccinationService.regenerateSchedule(id)
                    await refreshVax()
                    toast.success(added > 0 ? `Added ${added} vaccine${added === 1 ? '' : 's'} to the schedule` : 'Schedule already up to date')
                  } catch (err) {
                    toast.error(err.message ?? 'Could not generate schedule')
                  } finally {
                    setRegenerating(false)
                  }
                }}
              >
                <RefreshCw size={13} className={regenerating ? 'animate-spin' : ''} /> Generate schedule
              </Button>
              <Button size="sm" onClick={() => setVaxModal(true)}><Plus size={13} /> Schedule</Button>
            </div>
          </div>
          {vaccinations.length === 0 ? (
            <EmptyState
              icon={Syringe}
              title="No vaccinations scheduled"
              description={infant?.date_of_birth
                ? 'Click "Generate schedule" to auto-fill from the master vaccine list, or add one manually.'
                : 'This infant has no date of birth on file — add one in Overview, then generate the schedule automatically.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-zinc-950">
                  <tr>
                    <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Vaccine</th>
                    <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Scheduled</th>
                    <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Administered</th>
                    <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Status</th>
                    <th className="text-right px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {vaccinations.map(v => (
                    <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-zinc-950">
                      <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white">{v.vaccine_name}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-zinc-300">{v.scheduled_date ? new Date(v.scheduled_date).toLocaleDateString() : '—'}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-zinc-300">{v.administered_date ? new Date(v.administered_date).toLocaleDateString() : '—'}</td>
                      <td className="px-5 py-3"><StatusBadge status={v.status === 'administered' ? 'completed' : v.status} /></td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex gap-1.5">
                          {v.status !== 'administered' && (
                            <Button size="xs" onClick={async () => {
                              await vaccinationService.markAdministered(v.id)
                              toast.success('Marked as administered')
                              refreshVax()
                            }}>
                              <Check size={12} /> Done
                            </Button>
                          )}
                          <Button variant="danger" size="xs" onClick={async () => {
                            await vaccinationService.remove(v.id)
                            toast.success('Vaccination deleted')
                            refreshVax()
                          }}>
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Feeding ── */}
      {tab === 'feeding' && (
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-zinc-800">
            <h3 className="font-bold text-slate-900 dark:text-white">Feeding log</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-500">Logged by the parent via the NurtureX app (newest first).</p>
          </div>
          {feedings.length === 0 ? (
            <EmptyState icon={Utensils} title="No feedings logged yet" description="Feedings logged by the parent in the app will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-zinc-950">
                  <tr>
                    <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Time</th>
                    <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Type</th>
                    <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Amount</th>
                    <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Duration</th>
                    <th className="text-right px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {feedings.map(f => (
                    <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-zinc-950">
                      <td className="px-5 py-3 text-slate-600 dark:text-zinc-300">{new Date(f.fed_at).toLocaleString()}</td>
                      <td className="px-5 py-3 capitalize font-semibold text-slate-900 dark:text-white">{f.feed_type ?? '—'}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-zinc-300">{f.amount_ml ? `${f.amount_ml} ml` : '—'}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-zinc-300">{f.duration_min ? `${f.duration_min} min` : '—'}</td>
                      <td className="px-5 py-3 text-right">
                        <Button variant="danger" size="xs" onClick={async () => {
                          await feedingService.remove(f.id)
                          toast.success('Feeding deleted')
                          refreshFeeds()
                        }}>
                          <Trash2 size={12} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Lab Tests ── */}
      {tab === 'labs' && (() => {
        const filtered = labTests.filter(t => {
          if (labSearch.trim() && !t.test_name.toLowerCase().includes(labSearch.trim().toLowerCase())) return false
          const d = t.requested_at?.slice(0, 10)
          if (labFrom && (!d || d < labFrom)) return false
          if (labTo && (!d || d > labTo)) return false
          return true
        })
        return (
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <div className="p-4 sm:p-5 flex flex-wrap items-center gap-3 border-b border-slate-200 dark:border-zinc-800">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <input
                  value={labSearch} onChange={(e) => setLabSearch(e.target.value)}
                  placeholder="Search test name…"
                  className="block w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-sm outline-none focus:border-brand-500 text-slate-900 dark:text-white placeholder-slate-400"
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-500">
                <span>Date</span>
                <input type="date" value={labFrom} onChange={(e) => setLabFrom(e.target.value)}
                  className="h-9 px-2 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-200 outline-none focus:border-brand-500" />
                <span>to</span>
                <input type="date" value={labTo} onChange={(e) => setLabTo(e.target.value)}
                  className="h-9 px-2 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-200 outline-none focus:border-brand-500" />
                {(labSearch || labFrom || labTo) && (
                  <button onClick={() => { setLabSearch(''); setLabFrom(''); setLabTo('') }} className="text-brand-700 dark:text-white font-semibold hover:underline">clear</button>
                )}
              </div>
              <div className="ml-auto text-xs text-slate-500 dark:text-zinc-500">{filtered.length} of {labTests.length}</div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState icon={FlaskConical} title="No lab tests" description="Tests requested during appointments will show up here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 dark:text-zinc-500 border-b border-slate-200 dark:border-zinc-800">
                      <th className="px-5 py-3 font-medium">Test</th>
                      <th className="px-5 py-3 font-medium">Requested</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {filtered.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                        <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">{t.test_name}</td>
                        <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300">{fmtDate(t.requested_at)}</td>
                        <td className="px-5 py-3.5">
                          {t.status === 'reviewed'
                            ? <StatusBadge status="reviewed" />
                            : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">Waiting</span>}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 dark:text-zinc-400 max-w-xs truncate">{t.doctor_notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Medications ── */}
      {tab === 'medications' && (() => {
        const filtered = medications.filter(m => {
          if (medSearch.trim() && !m.medication_name.toLowerCase().includes(medSearch.trim().toLowerCase())) return false
          const d = m.created_at?.slice(0, 10)
          if (medFrom && (!d || d < medFrom)) return false
          if (medTo && (!d || d > medTo)) return false
          return true
        })
        return (
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <div className="p-4 sm:p-5 flex flex-wrap items-center gap-3 border-b border-slate-200 dark:border-zinc-800">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <input
                  value={medSearch} onChange={(e) => setMedSearch(e.target.value)}
                  placeholder="Search medication name…"
                  className="block w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-sm outline-none focus:border-brand-500 text-slate-900 dark:text-white placeholder-slate-400"
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-500">
                <span>Date</span>
                <input type="date" value={medFrom} onChange={(e) => setMedFrom(e.target.value)}
                  className="h-9 px-2 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-200 outline-none focus:border-brand-500" />
                <span>to</span>
                <input type="date" value={medTo} onChange={(e) => setMedTo(e.target.value)}
                  className="h-9 px-2 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-200 outline-none focus:border-brand-500" />
                {(medSearch || medFrom || medTo) && (
                  <button onClick={() => { setMedSearch(''); setMedFrom(''); setMedTo('') }} className="text-brand-700 dark:text-white font-semibold hover:underline">clear</button>
                )}
              </div>
              <div className="ml-auto text-xs text-slate-500 dark:text-zinc-500">{filtered.length} of {medications.length}</div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState icon={Pill} title="No medications" description="Prescriptions from appointments will show up here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 dark:text-zinc-500 border-b border-slate-200 dark:border-zinc-800">
                      <th className="px-5 py-3 font-medium">Medication</th>
                      <th className="px-5 py-3 font-medium">Dosage</th>
                      <th className="px-5 py-3 font-medium">Frequency</th>
                      <th className="px-5 py-3 font-medium">Duration</th>
                      <th className="px-5 py-3 font-medium">Prescribed</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {filtered.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                        <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">{m.medication_name}</td>
                        <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300">{m.dosage}</td>
                        <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300">{m.frequency}</td>
                        <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300">{m.duration}</td>
                        <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300">{fmtDate(m.created_at)}</td>
                        <td className="px-5 py-3.5"><StatusBadge status={m.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Medical History (unified, read-only) ── */}
      {tab === 'history' && (
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5 sm:p-6">
          <div className="mb-5">
            <h3 className="font-bold text-slate-900 dark:text-white">Medical History</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">
              Everything that's happened for {infant.name}, automatically compiled — newest first.
            </p>
          </div>

          {/* Filter chips — also double as an at-a-glance count per category */}
          <div className="flex flex-wrap gap-2 mb-6">
            {HISTORY_CATEGORIES.map((c) => {
              const count = c.key === 'all' ? historyEvents.length : historyEvents.filter(e => e.category === c.key).length
              const active = historyFilter === c.key
              const CatIcon = c.icon
              return (
                <button
                  key={c.key}
                  onClick={() => setHistoryFilter(c.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-semibold border transition',
                    active
                      ? 'bg-brand-700 text-white border-brand-700 dark:bg-white dark:text-black dark:border-white'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800 dark:hover:bg-zinc-800',
                  )}
                >
                  <CatIcon size={13} /> {c.label}
                  <span className={cn(
                    'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold',
                    active ? 'bg-white/20' : 'bg-slate-100 dark:bg-zinc-800',
                  )}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {(() => {
            const filtered = historyFilter === 'all' ? historyEvents : historyEvents.filter(e => e.category === historyFilter)

            if (filtered.length === 0) {
              return (
                <EmptyState
                  icon={History}
                  title={historyFilter === 'all' ? 'No history yet' : 'Nothing in this category yet'}
                  description="Medical events will appear here automatically as they happen."
                />
              )
            }

            // Group into date sections so a busy record is easy to scan.
            const groups = []
            for (const e of filtered) {
              const dayKey = new Date(e.date).toDateString()
              let group = groups.find(g => g.dayKey === dayKey)
              if (!group) { group = { dayKey, date: e.date, items: [] }; groups.push(group) }
              group.items.push(e)
            }

            return (
              <div className="space-y-6">
                {groups.map((g) => (
                  <div key={g.dayKey}>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-600 mb-2.5">
                      {new Date(g.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className="space-y-2.5">
                      {g.items.map((e, i) => {
                        const Icon = e.icon
                        return (
                          <div
                            key={i}
                            className="flex items-start gap-3 rounded-xl border border-slate-100 dark:border-zinc-800 p-3.5 hover:border-slate-200 dark:hover:border-zinc-700 transition"
                          >
                            <span className={cn('w-9 h-9 rounded-lg grid place-items-center shrink-0', HISTORY_COLORS[e.color])}>
                              <Icon size={16} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm text-slate-900 dark:text-white">{e.label}</div>
                              {e.detail && <div className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">{e.detail}</div>}
                              {!isAdmin && e.appointmentId && (
                                <button
                                  onClick={() => navigate(`/doctor/appointments/${e.appointmentId}`)}
                                  className="text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline mt-1.5"
                                >
                                  View appointment →
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* Modals */}
      <GrowthModal open={growthModal} onClose={() => setGrowthModal(false)} infantId={id} onSaved={refreshGrowth} />
      <VaxModal    open={vaxModal}    onClose={() => setVaxModal(false)}    infantId={id} onSaved={refreshVax} />
    </>
  )
}

function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5">
      <div className="text-xs font-medium text-slate-500 dark:text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 dark:text-zinc-500 mt-1">{sub}</div>}
    </div>
  )
}

/* ─── Modals ─── */

function GrowthModal({ open, onClose, infantId, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState({ measured_at: new Date().toISOString().slice(0,10), weight_kg: '', height_cm: '', head_circumference: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true)
    try { await growthService.create({ infant_id: infantId, ...f }); toast.success('Measurement saved'); await onSaved(); onClose() }
    catch (e) { setErr(e.message); toast.error(e.message) }
    finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="Add growth measurement"
      footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={submit} loading={saving}>Save</Button></>}>
      <form onSubmit={submit}>
        {err && <div className="rounded-lg border-l-[3px] border-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-3 flex gap-2.5 text-sm text-red-700 dark:text-red-400 mb-4"><AlertCircle size={16} /><span>{err}</span></div>}
        <Field label="Date"><Input type="date" value={f.measured_at} onChange={(e) => setF(v => ({ ...v, measured_at: e.target.value }))} disabled={saving} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Weight (kg)"><Input type="number" step="0.001" value={f.weight_kg} onChange={(e) => setF(v => ({ ...v, weight_kg: e.target.value }))} disabled={saving} /></Field>
          <Field label="Height (cm)"><Input type="number" step="0.1" value={f.height_cm} onChange={(e) => setF(v => ({ ...v, height_cm: e.target.value }))} disabled={saving} /></Field>
          <Field label="Head (cm)"><Input type="number" step="0.1" value={f.head_circumference} onChange={(e) => setF(v => ({ ...v, head_circumference: e.target.value }))} disabled={saving} /></Field>
        </div>
        <Field label="Notes"><Input value={f.notes} onChange={(e) => setF(v => ({ ...v, notes: e.target.value }))} disabled={saving} /></Field>
      </form>
    </Modal>
  )
}

function VaxModal({ open, onClose, infantId, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState({ vaccine_name: '', scheduled_date: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true)
    try {
      if (!f.vaccine_name.trim()) throw new Error('Vaccine name is required.')
      await vaccinationService.create({ infant_id: infantId, ...f })
      toast.success('Scheduled'); await onSaved(); onClose()
    } catch (e) { setErr(e.message); toast.error(e.message) }
    finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="Schedule vaccination"
      footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={submit} loading={saving}>Schedule</Button></>}>
      <form onSubmit={submit}>
        {err && <div className="rounded-lg border-l-[3px] border-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-3 flex gap-2.5 text-sm text-red-700 dark:text-red-400 mb-4"><AlertCircle size={16} /><span>{err}</span></div>}
        <Field label="Vaccine name" required><Input value={f.vaccine_name} onChange={(e) => setF(v => ({ ...v, vaccine_name: e.target.value }))} placeholder="e.g. BCG, MMR" disabled={saving} /></Field>
        <Field label="Scheduled date"><Input type="date" value={f.scheduled_date} onChange={(e) => setF(v => ({ ...v, scheduled_date: e.target.value }))} disabled={saving} /></Field>
        <Field label="Notes"><Input value={f.notes} onChange={(e) => setF(v => ({ ...v, notes: e.target.value }))} disabled={saving} /></Field>
      </form>
    </Modal>
  )
}

