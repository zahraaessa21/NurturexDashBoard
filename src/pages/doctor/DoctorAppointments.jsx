// src/pages/doctor/DoctorAppointments.jsx
//
// Real-time appointment management with Accept / Reject / Complete actions.
// Parent bookings arrive with status='scheduled'. Doctor can accept (keep),
// reject (cancel), or complete them. All changes broadcast via Supabase Realtime.

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, List,
  Trash2, Clock, MapPin, RefreshCw, CheckCircle2, XCircle,
  Check, AlertTriangle, Bell, Syringe, CalendarOff, ArrowRight,
} from 'lucide-react'

import { useAuth }  from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { appointmentService } from '../../services/appointmentService'
import { patientService }     from '../../services/patientService'
import { infantService }      from '../../services/infantService'
import { leaveService }       from '../../services/leaveService'
import { supabase }           from '../../supabaseClient'

import StatusBadge from '../../components/StatusBadge'
import EmptyState  from '../../components/EmptyState'
import Button      from '../../components/ui/Button'
import Modal       from '../../components/ui/Modal'
import { Field, Input, Select } from '../../components/ui/Field'
import { Skeleton } from '../../components/ui/Skeleton'
import { cn } from '../../utils/cn'

const TYPE_COLORS = {
  checkup:      'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200',
  vaccination:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  consultation: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  follow_up:    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  other:        'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300',
}

const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS   = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December']
const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

const pad = n => String(n).padStart(2, '0')
function splitDateTime(iso) {
  const d = new Date(iso)
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}
function dateOnly(y, m, d) { return new Date(y, m - 1, d) }

const EMPTY_FORM = {
  parent_id: '', infant_id: '',
  date: '', time: '', duration_min: 30,
  appt_type: 'checkup', status: 'scheduled',
  location: '', notes: '',
}

/** Simple type-to-filter combobox — used for the mother / infant pickers. */
function SearchableSelect({ value, options, onSelect, placeholder, disabled, getLabel = (o) => o.full_name }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.id === value)
  const filtered = query.trim()
    ? options.filter(o => getLabel(o).toLowerCase().includes(query.trim().toLowerCase()))
    : options

  return (
    <div className="relative">
      <input
        value={open ? query : (selected ? getLabel(selected) : '')}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => { setQuery(''); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        disabled={disabled}
        className="block w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lift">
          {filtered.map(o => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(o); setOpen(false); setQuery('') }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200"
            >
              {getLabel(o)}
            </button>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lift px-3 py-2 text-sm text-slate-400">
          No matches
        </div>
      )}
    </div>
  )
}

export default function DoctorAppointments() {
  const { user, profile } = useAuth()
  const toast = useToast()
  const today = useMemo(() => new Date(), [])

  const [view,    setView]    = useState('calendar')
  const [year,    setYear]    = useState(today.getFullYear())
  const [month,   setMonth]   = useState(today.getMonth() + 1)
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState('')

  // ── Emergency leave ───────────────────────────────────────────────
  const [leaveModalOpen, setLeaveModalOpen] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ date: '', startTime: '', endTime: '', allDay: false, reason: '' })
  const [leavePreviewing, setLeavePreviewing] = useState(false)
  const [leaveError, setLeaveError] = useState('')
  const [leaveProposals, setLeaveProposals] = useState(null) // null = still on input step
  const [leaveNames, setLeaveNames] = useState({}) // appointmentId -> { parentName, infantName }
  const [leaveConfirming, setLeaveConfirming] = useState(false)
  const [pendingLeaveWindow, setPendingLeaveWindow] = useState(null)

  const [patients, setPatients] = useState([])
  const [infants,  setInfants]  = useState([])

  const realtimeRef = useRef(null)

  // ── Preload patients + infants ────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    Promise.all([
      patientService.list({ doctorId: user.id, pageSize: 1000 }).then(r => setPatients(r.rows)).catch(() => {}),
      infantService.list({ doctorId: user.id, pageSize: 1000 }).then(r => setInfants(r.rows)).catch(() => {}),
    ])
  }, [user])

  // ── Load month data ───────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const data = await appointmentService.listForMonth({ doctorId: user.id, year, month })
      setItems(data)
      setPendingCount(data.filter(a => a.status === 'pending').length)
    } catch (err) {
      toast.error(err.message ?? 'Could not load appointments')
    } finally {
      setLoading(false)
    }
  }, [user, year, month, toast])

  useEffect(() => { load() }, [load])

  // ── Emergency leave handlers ───────────────────────────────────────
  const openLeaveModal = () => {
    const today = new Date()
    setLeaveForm({
      date: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
      startTime: '', endTime: '', allDay: false, reason: '',
    })
    setLeaveError('')
    setLeaveProposals(null)
    setLeaveModalOpen(true)
  }

  const closeLeaveModal = () => {
    if (leavePreviewing || leaveConfirming) return
    setLeaveModalOpen(false)
    setLeaveProposals(null)
    setPendingLeaveWindow(null)
  }

  const buildLeaveWindow = () => {
    if (!leaveForm.date) throw new Error('Please pick a date.')
    const startAt = leaveForm.allDay
      ? new Date(`${leaveForm.date}T00:00:00`)
      : new Date(`${leaveForm.date}T${leaveForm.startTime || '00:00'}:00`)
    const endAt = leaveForm.allDay
      ? new Date(`${leaveForm.date}T23:59:59`)
      : new Date(`${leaveForm.date}T${leaveForm.endTime || '23:59'}:00`)
    if (!leaveForm.allDay && (!leaveForm.startTime || !leaveForm.endTime)) {
      throw new Error('Please set both a start and end time, or choose "Whole day".')
    }
    if (endAt <= startAt) throw new Error('End time must be after start time.')
    return { startAt, endAt }
  }

  const handlePreviewLeave = async (e) => {
    e.preventDefault()
    setLeaveError('')
    let window
    try {
      window = buildLeaveWindow()
    } catch (err) {
      setLeaveError(err.message)
      return
    }
    setLeavePreviewing(true)
    try {
      const rows = await leaveService.previewReschedules({
        doctorId: user.id,
        startAt: window.startAt.toISOString(),
        endAt: window.endAt.toISOString(),
      })
      setPendingLeaveWindow(window)
      setLeaveProposals(rows)

      // Resolve parent/infant names for display — small batch, individual
      // lookups are fine (a leave window rarely affects more than a
      // handful of appointments).
      const names = {}
      await Promise.all(rows.map(async (r) => {
        try {
          const [p, i] = await Promise.all([
            r.parent_id ? patientService.getById(r.parent_id).catch(() => null) : null,
            r.infant_id ? infantService.getById(r.infant_id).catch(() => null) : null,
          ])
          names[r.appointment_id] = {
            parentName: p?.full_name ?? 'Unknown parent',
            infantName: i?.name ?? null,
          }
        } catch {
          names[r.appointment_id] = { parentName: 'Unknown parent', infantName: null }
        }
      }))
      setLeaveNames(names)
    } catch (err) {
      setLeaveError(err.message ?? 'Could not compute affected appointments.')
    } finally {
      setLeavePreviewing(false)
    }
  }

  const handleConfirmLeave = async () => {
    if (!pendingLeaveWindow) return
    setLeaveConfirming(true)
    setLeaveError('')
    try {
      await leaveService.confirmLeave({
        doctorId: user.id,
        startAt: pendingLeaveWindow.startAt.toISOString(),
        endAt: pendingLeaveWindow.endAt.toISOString(),
        reason: leaveForm.reason,
      })
      toast.success(
        leaveProposals.length > 0
          ? `Leave confirmed — ${leaveProposals.length} appointment${leaveProposals.length > 1 ? 's' : ''} sent for reschedule approval.`
          : 'Leave confirmed — no appointments were affected.'
      )
      setLeaveModalOpen(false)
      setLeaveProposals(null)
      setPendingLeaveWindow(null)
      load()
    } catch (err) {
      setLeaveError(err.message ?? 'Could not confirm this leave period.')
    } finally {
      setLeaveConfirming(false)
    }
  }

  const backToLeaveForm = () => {
    setLeaveProposals(null)
    setPendingLeaveWindow(null)
    setLeaveError('')
  }

  // ── Realtime subscription ─────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return

    const ch = supabase
      .channel(`appts:${user.id}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'appointments',
          filter: `doctor_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // New booking from parent — add to list if in current month
            const appt = payload.new
            const d = new Date(appt.scheduled_at)
            if (d.getFullYear() === year && d.getMonth() + 1 === month) {
              setItems(prev => {
                if (prev.some(a => a.id === appt.id)) return prev
                const next = [...prev, appt].sort(
                  (a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)
                )
                setPendingCount(next.filter(a => a.status === 'pending').length)
                return next
              })
              toast.success('📅 New appointment request received!')
            }
          } else if (payload.eventType === 'UPDATE') {
            setItems(prev => prev.map(a =>
              a.id === payload.new.id ? { ...a, ...payload.new } : a
            ))
          } else if (payload.eventType === 'DELETE') {
            setItems(prev => prev.filter(a => a.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    realtimeRef.current = ch
    return () => { ch.unsubscribe() }
  }, [user, year, month, toast])

  const defaultLocation = profile?.clinic_name
    ? `${profile.clinic_name}${profile.clinic_address ? ` — ${profile.clinic_address}` : ''}`
    : ''

  const openCreate = (date) => {
    setEditing(null)
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    setForm({
      ...EMPTY_FORM,
      date: dateStr,
      location: defaultLocation,
    })
    setFormError('')
    setModalOpen(true)
  }

  // Day-detail modal: clicking a calendar day shows what's already booked
  // that day (as a table), with an "Add appointment" button to open the
  // create form for that same day.
  const [dayModal, setDayModal] = useState(null) // { date, items } | null
  const openDay = (date) => {
    const k = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    const dayItems = items
      .filter(a => {
        const d = new Date(a.scheduled_at)
        const dk = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        return dk === k
      })
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    setDayModal({ date, items: dayItems })
  }

  const openEdit = (appt) => {
    setEditing(appt)
    const { date, time } = splitDateTime(appt.scheduled_at)
    setForm({
      parent_id:    appt.parent_id   ?? '',
      infant_id:    appt.infant_id   ?? '',
      date, time,
      duration_min: appt.duration_min ?? 30,
      appt_type:    appt.appt_type   ?? 'checkup',
      status:       appt.status      ?? 'scheduled',
      location:     appt.location    ?? '',
      notes:        appt.notes       ?? '',
      // read-only context for display
      _parent:      appt.parent      ?? null,
      _infant:      appt.infant      ?? null,
    })
    setFormError('')
    setModalOpen(true)
  }

  // ── Time slots: derived from the doctor's own working hours (set at
  //    registration/profile), the chosen duration, and what's already
  //    booked that day. Doctor never picks an out-of-hours or double-
  //    booked time. ──────────────────────────────────────────────────
  const availableSlots = useMemo(() => {
    if (!form.date) return []
    const [y, m, d] = form.date.split('-').map(Number)
    const dayName = DAY_NAMES[dateOnly(y, m, d).getDay()]
    const workingHours = Array.isArray(profile?.working_hours) ? profile.working_hours : []
    const todayRanges = workingHours.filter(w => w.day === dayName)
    if (todayRanges.length === 0) return []

    const duration = Number(form.duration_min) || 30

    // Every existing appointment that day, as a [start, end) minute range.
    const busy = items
      .filter(a => {
        if (editing && a.id === editing.id) return false
        if (a.status === 'canceled' || a.status === 'rejected') return false
        const ad = new Date(a.scheduled_at)
        return ad.getFullYear() === y && ad.getMonth() === m - 1 && ad.getDate() === d
      })
      .map(a => {
        const ad = new Date(a.scheduled_at)
        const start = ad.getHours() * 60 + ad.getMinutes()
        return { start, end: start + (a.duration_min ?? 30) }
      })
      .sort((a, b) => a.start - b.start)

    // For each working-hours range, carve out the busy blocks to get the
    // actual free gaps left over — not just "step by duration from the
    // start of the day", which can skip right past a real gap that
    // doesn't happen to land on that step size (e.g. a 9:00-9:30 booking
    // followed by a 12:00-12:45 one leaves 9:30-12:00 free either way).
    const SLOT_STEP = 15 // minutes — granularity for candidate start times within a free gap
    const slots = []

    for (const range of todayRanges) {
      const [sh, sm] = (range.start ?? '09:00').split(':').map(Number)
      const [eh, em] = (range.end ?? '17:00').split(':').map(Number)
      const rangeStart = sh * 60 + sm
      const rangeEnd = eh * 60 + em

      let cursor = rangeStart
      const gaps = []
      for (const b of busy) {
        const bStart = Math.max(b.start, rangeStart)
        const bEnd = Math.min(b.end, rangeEnd)
        if (bStart >= rangeEnd || bEnd <= rangeStart) continue
        if (bStart > cursor) gaps.push({ start: cursor, end: bStart })
        cursor = Math.max(cursor, bEnd)
      }
      if (cursor < rangeEnd) gaps.push({ start: cursor, end: rangeEnd })

      for (const gap of gaps) {
        let t = gap.start
        while (t + duration <= gap.end) {
          slots.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`)
          t += SLOT_STEP
        }
      }
    }

    return slots
  }, [form.date, form.duration_min, profile, items, editing])

  useEffect(() => {
    if (form.time && !availableSlots.includes(form.time)) {
      setForm(f => ({ ...f, time: '' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableSlots])

  const doctorWorksThisDay = form.date
    ? (Array.isArray(profile?.working_hours) ? profile.working_hours : []).some(
        w => w.day === DAY_NAMES[dateOnly(...form.date.split('-').map(Number)).getDay()],
      )
    : true

  // Selecting a mother auto-fills her infant (first one on file for her).
  const selectParent = (p) => {
    const babiesOfParent = infants.filter(i => i.parent?.id === p.id)
    setForm(f => ({ ...f, parent_id: p.id, infant_id: babiesOfParent[0]?.id ?? f.infant_id }))
  }
  const selectInfant = (i) => {
    setForm(f => ({ ...f, infant_id: i.id, parent_id: i.parent?.id ?? f.parent_id }))
  }

  // ── Quick status change (accept / reject / complete) ──────────────
  const quickStatus = async (id, status, label) => {
    try {
      await appointmentService.setStatus(id, status)
      setItems(prev => prev.map(a => a.id === id ? { ...a, status } : a))
      toast.success(`Appointment ${label}`)
      // Update pending count
      setPendingCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      toast.error(err.message ?? `Could not ${label} appointment`)
    }
  }

  const submit = async (e) => {
    e.preventDefault(); setFormError('')

    // ── Frontend validation (mirrors the service-side guard) ──────────
    if (!form.date) {
      return setFormError('No date selected — click a day on the calendar first.')
    }
    if (!form.time) {
      return setFormError('Please choose a time.')
    }
    const when = new Date(`${form.date}T${form.time}:00`)
    if (Number.isNaN(when.getTime())) {
      return setFormError('The date and time you entered is invalid.')
    }
    // Only block past times when creating (editing an old appt is allowed).
    if (!editing && when.getTime() < Date.now()) {
      return setFormError('You cannot book an appointment in the past.')
    }
    if (!form.parent_id) {
      return setFormError('Please select a patient for the appointment.')
    }
    if (!form.appt_type) {
      return setFormError('Please choose an appointment type.')
    }

    setSaving(true)
    try {
      const { _parent, _infant, date, time, ...formData } = form
      const payload = {
        ...formData,
        doctor_id:    user.id,
        parent_id:    form.parent_id  || null,
        infant_id:    form.infant_id  || null,
        scheduled_at: when.toISOString(),
        duration_min: Number(form.duration_min) || 30,
      }
      if (editing) {
        const updated = await appointmentService.update(editing.id, payload)
        setItems(prev => prev.map(a => a.id === editing.id ? updated : a))
        toast.success('Appointment updated')
      } else {
        const created = await appointmentService.create(payload)
        setItems(prev => [...prev, created].sort(
          (a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)
        ))
        toast.success('Appointment created')
      }
      setModalOpen(false)
    } catch (err) {
      setFormError(err.message ?? 'Could not save appointment')
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (status) => {
    if (!editing) return
    setSaving(true)
    try {
      await appointmentService.setStatus(editing.id, status)
      setItems(prev => prev.map(a => a.id === editing.id ? { ...a, status } : a))
      setForm(f => ({ ...f, status }))
      toast.success(`Marked as ${status.replace('_', ' ')}`)
      setModalOpen(false)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!editing || !confirm('Delete this appointment?')) return
    setSaving(true)
    try {
      await appointmentService.remove(editing.id)
      setItems(prev => prev.filter(a => a.id !== editing.id))
      toast.success('Deleted')
      setModalOpen(false)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const goPrev = () => { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const goNext = () => { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }

  // ── Pending requests panel ────────────────────────────────────────
  const pendingItems = items.filter(a => a.status === 'pending')

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Appointments
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-500 mt-1">
            Real-time calendar — parent bookings appear instantly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Pending badge */}
          {pendingCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-semibold">
              <Bell size={12} className="animate-pulse" />
              {pendingCount} pending request{pendingCount > 1 ? 's' : ''}
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button variant="secondary" size="sm" onClick={openLeaveModal}>
            <CalendarOff size={13} /> Mark Unavailable
          </Button>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-zinc-800 p-1">
            <button
              onClick={() => setView('calendar')}
              className={cn('px-2.5 py-1 rounded text-xs font-semibold transition', view === 'calendar' ? 'bg-brand-700 text-white' : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800')}
            >
              <CalIcon size={13} />
            </button>
            <button
              onClick={() => setView('list')}
              className={cn('px-2.5 py-1 rounded text-xs font-semibold transition', view === 'list' ? 'bg-brand-700 text-white' : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800')}
            >
              <List size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Pending requests panel */}
      {pendingItems.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
            <h3 className="font-bold text-amber-900 dark:text-amber-200 text-sm">
              Pending Appointment Requests ({pendingItems.length})
            </h3>
          </div>
          <div className="space-y-2">
            {pendingItems.map(a => {
              const dt = new Date(a.scheduled_at)
              const notesClean = (a.notes ?? '').replace(/parent_id:[a-z0-9-]+\s*\|?\s*/g, '').trim()
              return (
                <div key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white dark:bg-zinc-900 rounded-xl p-3 border border-amber-100 dark:border-zinc-800">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-[11px] font-bold uppercase px-1.5 py-0.5 rounded', TYPE_COLORS[a.appt_type] ?? TYPE_COLORS.other)}>
                        {a.appt_type?.replace('_', ' ')}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {a.patient?.full_name || a.parent?.full_name || a.infant?.name || 'Patient'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5 flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={10} />
                        {dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' at '}
                        {dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      {a.location && <span className="inline-flex items-center gap-1"><MapPin size={10} />{a.location}</span>}
                    </div>
                    {notesClean && (
                      <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 line-clamp-1">{notesClean}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => quickStatus(a.id, 'scheduled', 'accepted')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition"
                    >
                      <CheckCircle2 size={13} /> Accept
                    </button>
                    <button
                      onClick={() => quickStatus(a.id, 'rejected', 'rejected')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition"
                    >
                      <XCircle size={13} /> Reject
                    </button>
                    <button
                      onClick={() => openEdit(a)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 transition"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Month nav */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white px-2">
            {MONTHS[month - 1]} {year}
          </h2>
          <button onClick={goNext} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="text-xs text-slate-500 dark:text-zinc-500 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </div>
      </div>

      {view === 'calendar'
        ? <CalendarGrid year={year} month={month} today={today} loading={loading} items={items} onAddDay={openDay} onEditAppt={openEdit} />
        : <ListView loading={loading} items={items} onEditAppt={openEdit} onQuickStatus={quickStatus} />
      }

      {/* Day appointments — table of what's booked, + Add appointment */}
      <Modal
        open={!!dayModal}
        onClose={() => setDayModal(null)}
        title={dayModal ? dayModal.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''}
        size="lg"
        footer={
          <div className="flex items-center gap-2 w-full">
            <Button variant="secondary" onClick={() => setDayModal(null)} type="button" className="ml-auto">Close</Button>
            <Button
              type="button"
              onClick={() => { const d = dayModal.date; setDayModal(null); openCreate(d) }}
            >
              <Plus size={13} /> Add appointment
            </Button>
          </div>
        }
      >
        {dayModal && dayModal.items.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-zinc-500 py-6 text-center">
            No appointments on this day.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 dark:text-zinc-500 border-b border-slate-200 dark:border-zinc-800">
                  <th className="px-2 py-2 font-medium">Time</th>
                  <th className="px-2 py-2 font-medium">Patient</th>
                  <th className="px-2 py-2 font-medium hidden sm:table-cell">Type</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {dayModal?.items.map(a => {
                  const time = new Date(a.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                  const who = a.infant?.name || a.parent?.full_name || 'Patient'
                  const canOpenVisit = a.status === 'scheduled' || a.status === 'completed'
                  return (
                    <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition">
                      <td className="px-2 py-2.5 font-semibold text-slate-900 dark:text-white whitespace-nowrap cursor-pointer" onClick={() => { setDayModal(null); openEdit(a) }}>{time}</td>
                      <td className="px-2 py-2.5 text-slate-700 dark:text-zinc-200 truncate max-w-[160px] cursor-pointer" onClick={() => { setDayModal(null); openEdit(a) }}>{who}</td>
                      <td className="px-2 py-2.5 hidden sm:table-cell cursor-pointer" onClick={() => { setDayModal(null); openEdit(a) }}>
                        <span className={cn('text-[11px] font-bold uppercase px-1.5 py-0.5 rounded', TYPE_COLORS[a.appt_type] ?? TYPE_COLORS.other)}>
                          {a.appt_type?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 cursor-pointer" onClick={() => { setDayModal(null); openEdit(a) }}><StatusBadge status={a.status} /></td>
                      <td className="px-2 py-2.5 text-right">
                        {canOpenVisit && (
                          <Link
                            to={`/doctor/appointments/${a.id}`}
                            onClick={() => setDayModal(null)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-[11px] font-semibold transition dark:bg-white dark:text-black whitespace-nowrap"
                          >
                            <Syringe size={11} /> {a.status === 'completed' ? 'View visit' : 'Open visit'}
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Appointment' : 'New Appointment'}
        footer={
          <div className="flex items-center gap-2 w-full">
            {editing && (
              <Button variant="danger" size="sm" onClick={remove} loading={saving} type="button" className="mr-auto">
                <Trash2 size={13} /> Delete
              </Button>
            )}
            <Button variant="secondary" onClick={() => setModalOpen(false)} type="button">Cancel</Button>
            <Button form="appt-form" type="submit" loading={saving}>Save</Button>
          </div>
        }
      >
        <form id="appt-form" onSubmit={submit} className="space-y-3">
          {formError && (
            <div className="rounded-lg border-l-4 border-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {formError}
            </div>
          )}

          {editing && (form._parent || form._infant) && (
            <div className="rounded-xl bg-brand-50 dark:bg-zinc-800/60 border border-brand-100 dark:border-zinc-700 p-3 text-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300 mb-1.5">
                Request details
              </p>
              {form._parent && (
                <p className="text-slate-700 dark:text-zinc-200">
                  <span className="font-semibold">Parent:</span> {form._parent.full_name ?? '—'}
                  {form._parent.phone ? `  ·  ${form._parent.phone}` : ''}
                </p>
              )}
              {form._infant && (
                <p className="text-slate-700 dark:text-zinc-200">
                  <span className="font-semibold">Baby:</span> {form._infant.name ?? '—'}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Mother" hint="Type to search">
              <SearchableSelect
                value={form.parent_id}
                options={patients}
                onSelect={selectParent}
                placeholder="Search mother by name…"
                disabled={saving}
                getLabel={(p) => p.full_name}
              />
            </Field>
            <Field label="Baby / Infant" hint="Auto-filled from mother">
              <SearchableSelect
                value={form.infant_id}
                options={infants}
                onSelect={selectInfant}
                placeholder="Search infant by name…"
                disabled={saving}
                getLabel={(i) => i.name}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <div className="h-10 flex items-center px-3 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-sm text-slate-700 dark:text-zinc-200">
                {form.date
                  ? dateOnly(...form.date.split('-').map(Number)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                  : '—'}
              </div>
            </Field>
            <Field label="Duration (min)">
              <Select value={form.duration_min} onChange={e => setForm(f => ({ ...f, duration_min: e.target.value }))} disabled={saving}>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
              </Select>
            </Field>
          </div>

          <Field
            label="Time"
            required
            hint={!doctorWorksThisDay ? "You don't work this day, per your profile hours" : (availableSlots.length === 0 ? 'No open slots left this day' : undefined)}
          >
            <Select value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} disabled={saving || availableSlots.length === 0}>
              <option value="">{availableSlots.length === 0 ? 'No available times' : 'Select a time'}</option>
              {availableSlots.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" required>
              <Select value={form.appt_type} onChange={e => setForm(f => ({ ...f, appt_type: e.target.value }))} disabled={saving}>
                <option value="checkup">Check-up</option>
                <option value="vaccination">Vaccination</option>
                <option value="consultation">Consultation</option>
                <option value="follow_up">Follow-up</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} disabled={saving}>
                <option value="pending">Pending request</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="canceled">Canceled</option>
                <option value="rejected">Rejected</option>
                <option value="no_show">No-show</option>
              </Select>
            </Field>
          </div>

          <Field label="Location">
            <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Clinic name + address" disabled={saving} />
          </Field>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="block w-full px-3.5 py-2.5 rounded-lg text-sm bg-white dark:bg-zinc-900 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-800 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 outline-none resize-y"
              disabled={saving}
              placeholder="Reason for visit, prep instructions…"
            />
          </Field>

          {editing && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-slate-500 dark:text-zinc-500">Quick:</span>
              {editing.status !== 'completed' && (
                <button type="button" onClick={() => setStatus('completed')} disabled={saving}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-200 transition">
                  <CheckCircle2 size={11} /> Complete
                </button>
              )}
              {editing.status !== 'canceled' && (
                <button type="button" onClick={() => setStatus('canceled')} disabled={saving}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 text-xs font-semibold hover:bg-red-200 transition">
                  <XCircle size={11} /> Cancel
                </button>
              )}
              {editing.status !== 'no_show' && (
                <button type="button" onClick={() => setStatus('no_show')} disabled={saving}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 text-xs font-semibold hover:bg-slate-200 transition">
                  No-show
                </button>
              )}
            </div>
          )}
        </form>
      </Modal>

      {/* ── Emergency Leave — step 1: pick the window, step 2: review & confirm ── */}
      <Modal
        open={leaveModalOpen}
        onClose={closeLeaveModal}
        title={leaveProposals === null ? 'Mark Unavailable' : 'Review Affected Appointments'}
        size="lg"
        footer={
          leaveProposals === null ? (
            <div className="flex items-center gap-2 w-full">
              <Button variant="secondary" onClick={closeLeaveModal} type="button" disabled={leavePreviewing} className="ml-auto">
                Cancel
              </Button>
              <Button type="button" onClick={handlePreviewLeave} loading={leavePreviewing}>
                {leavePreviewing ? 'Checking…' : <>Review Affected Appointments <ArrowRight size={14} /></>}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full">
              <Button variant="secondary" onClick={backToLeaveForm} type="button" disabled={leaveConfirming}>
                Back
              </Button>
              <Button variant="secondary" onClick={closeLeaveModal} type="button" disabled={leaveConfirming} className="ml-auto">
                Cancel
              </Button>
              <Button variant="danger" type="button" onClick={handleConfirmLeave} loading={leaveConfirming}>
                {leaveConfirming ? 'Confirming…' : `Confirm — Notify ${leaveProposals.length} Famil${leaveProposals.length === 1 ? 'y' : 'ies'}`}
              </Button>
            </div>
          )
        }
      >
        {leaveError && (
          <div className="mb-4 rounded-lg border-l-[3px] border-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-3 flex items-start gap-2.5 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{leaveError}</span>
          </div>
        )}

        {leaveProposals === null ? (
          <form onSubmit={handlePreviewLeave} className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-zinc-500">
              Pick when you're unavailable. Any of your appointments in that window will be
              reviewed on the next screen before anything is sent to families.
            </p>

            <Field label="Date" required>
              <Input
                type="date" required disabled={leavePreviewing}
                value={leaveForm.date}
                onChange={(e) => setLeaveForm(v => ({ ...v, date: e.target.value }))}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={leaveForm.allDay}
                disabled={leavePreviewing}
                onChange={(e) => setLeaveForm(v => ({ ...v, allDay: e.target.checked }))}
                className="rounded border-slate-300 dark:border-zinc-700 text-brand-600 focus:ring-brand-500"
              />
              Whole day
            </label>

            {!leaveForm.allDay && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start time" required>
                  <Input
                    type="time" required disabled={leavePreviewing}
                    value={leaveForm.startTime}
                    onChange={(e) => setLeaveForm(v => ({ ...v, startTime: e.target.value }))}
                  />
                </Field>
                <Field label="End time" required>
                  <Input
                    type="time" required disabled={leavePreviewing}
                    value={leaveForm.endTime}
                    onChange={(e) => setLeaveForm(v => ({ ...v, endTime: e.target.value }))}
                  />
                </Field>
              </div>
            )}

            <Field label="Reason (optional, internal note)">
              <Input
                value={leaveForm.reason} disabled={leavePreviewing}
                onChange={(e) => setLeaveForm(v => ({ ...v, reason: e.target.value }))}
                placeholder="e.g. Family emergency"
              />
            </Field>
          </form>
        ) : (
          <div className="space-y-4">
            {leaveProposals.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No appointments affected"
                description="You have no appointments scheduled in this window — you can confirm the leave with nothing to reschedule."
              />
            ) : (
              <>
                <p className="text-sm text-slate-500 dark:text-zinc-500">
                  These {leaveProposals.length} appointment{leaveProposals.length > 1 ? 's fall' : ' falls'} inside
                  your unavailable window. Each family will be asked to accept or reject the new time below —
                  nothing changes until they respond.
                </p>
                <div className="space-y-2">
                  {leaveProposals.map((p) => {
                    const names = leaveNames[p.appointment_id] ?? {}
                    const noSlot = !p.proposed_scheduled_at
                    return (
                      <div
                        key={p.appointment_id}
                        className={cn(
                          'rounded-xl border p-3',
                          noSlot
                            ? 'border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10'
                            : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                        )}
                      >
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                          {names.parentName ?? 'Loading…'}
                          {names.infantName && (
                            <span className="font-normal text-slate-500 dark:text-zinc-500"> · {names.infantName}</span>
                          )}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-xs">
                          <span className="text-slate-500 dark:text-zinc-500 line-through">
                            {new Date(p.original_scheduled_at).toLocaleString('en-US', {
                              weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                            })}
                          </span>
                          <ArrowRight size={12} className="text-slate-400 shrink-0" />
                          {noSlot ? (
                            <span className="font-semibold text-red-600 dark:text-red-400">
                              No slot found in the next 30 days — handle manually
                            </span>
                          ) : (
                            <span className="font-semibold text-violet-700 dark:text-violet-400">
                              {new Date(p.proposed_scheduled_at).toLocaleString('en-US', {
                                weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

/* ── Calendar grid ───────────────────────────────────────────────── */
function CalendarGrid({ year, month, today, loading, items, onAddDay, onEditAppt }) {
  const cells = useMemo(() => buildMonthCells(year, month), [year, month])
  const byDay = useMemo(() => {
    const m = new Map()
    for (const it of items) {
      const d = new Date(it.scheduled_at)
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(it)
    }
    return m
  }, [items])

  const isToday = d => d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  const inMonth = d => d.getMonth() === month - 1
  const startOfToday = useMemo(() => { const t = new Date(today); t.setHours(0,0,0,0); return t }, [today])
  const isPast = d => { const dd = new Date(d); dd.setHours(0,0,0,0); return dd < startOfToday }

  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
      <div className="grid grid-cols-7 bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500 py-2">{d}</div>
        ))}
      </div>
      {loading ? (
        <div className="p-3 grid grid-cols-7 gap-px">
          {Array.from({ length: 35 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-md" />)}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-zinc-800">
          {cells.map((d, i) => {
            const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
            const dayItems = byDay.get(k) ?? []
            const muted    = !inMonth(d)
            const todayCell = isToday(d)
            const pastCell  = isPast(d)
            const hasPending = dayItems.some(a => a.status === 'pending')
            return (
              <div key={i} onClick={() => { if (!pastCell) onAddDay(d) }}
                className={cn('group min-h-[88px] sm:min-h-[112px] p-1.5 transition',
                  pastCell
                    ? 'bg-red-50 dark:bg-red-950/20 cursor-not-allowed'
                    : cn('bg-white dark:bg-zinc-900 cursor-pointer hover:bg-brand-50/30 dark:hover:bg-zinc-800/50', muted && 'bg-slate-50 dark:bg-zinc-950'),
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={cn(
                    'inline-grid place-items-center h-6 min-w-6 px-1.5 text-[11px] font-bold rounded-full',
                    todayCell ? 'bg-brand-700 text-white dark:bg-white dark:text-black' :
                    pastCell ? 'text-red-400 dark:text-red-500/70' :
                    muted ? 'text-slate-400 dark:text-zinc-700' : 'text-slate-700 dark:text-zinc-300'
                  )}>
                    {d.getDate()}
                  </span>
                  {hasPending && !pastCell && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                </div>
                {!pastCell && (
                  <div className="space-y-0.5">
                    {dayItems.slice(0, 3).map(a => {
                      const time = new Date(a.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                      return (
                        <button key={a.id}
                          onClick={e => { e.stopPropagation(); onEditAppt(a) }}
                          className={cn(
                            'block w-full text-left rounded px-1.5 py-1 text-[10px] sm:text-[11px] font-semibold leading-tight truncate',
                            TYPE_COLORS[a.appt_type] ?? TYPE_COLORS.other,
                            a.status === 'canceled' && 'opacity-50 line-through',
                            a.status === 'completed' && 'opacity-70',
                          )}
                          title={`${time} — ${a.appt_type}`}
                        >
                          <span className="hidden sm:inline">{time} </span>
                          {a.patient?.full_name ?? a.parent?.full_name ?? a.infant?.name ?? a.appt_type}
                        </button>
                      )
                    })}
                    {dayItems.length > 3 && (
                      <div className="text-[10px] text-slate-500 dark:text-zinc-500 px-1.5">+{dayItems.length - 3} more</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── List view ───────────────────────────────────────────────────── */
function ListView({ loading, items, onEditAppt, onQuickStatus }) {
  if (loading) return <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
  if (!items.length) return <EmptyState icon={CalIcon} title="No appointments this month" description="Appointments booked by parents will appear here." />

  return (
    <ul className="space-y-2">
      {items.map(a => {
        const dt = new Date(a.scheduled_at)
        const isPending = a.status === 'pending'
        const notesClean = (a.notes ?? '').replace(/parent_id:[a-z0-9-]+\s*\|?\s*/g, '').trim()
        return (
          <li key={a.id} className={cn('rounded-xl bg-white dark:bg-zinc-900 border p-4 transition',
            isPending
              ? 'border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5'
              : 'border-slate-200 dark:border-zinc-800 hover:shadow-card hover:-translate-y-px'
          )}>
            <div className="flex items-start gap-3">
              <button onClick={() => onEditAppt(a)} className="text-center shrink-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">
                  {dt.toLocaleDateString('en-US', { month: 'short' })}
                </div>
                <div className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">
                  {dt.getDate()}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-500">
                  {dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </div>
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={cn('text-[11px] font-bold uppercase px-1.5 py-0.5 rounded', TYPE_COLORS[a.appt_type] ?? TYPE_COLORS.other)}>
                    {a.appt_type?.replace('_', ' ')}
                  </span>
                  <StatusBadge status={a.status} />
                  {isPending && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <Bell size={9} className="animate-pulse" /> Awaiting acceptance
                    </span>
                  )}
                </div>
                <div className="font-semibold text-slate-900 dark:text-white truncate">
                  {a.patient?.full_name || a.parent?.full_name || a.infant?.name || 'Unassigned'}
                </div>
                <div className="text-xs text-slate-500 dark:text-zinc-500 flex items-center gap-3 flex-wrap mt-0.5">
                  <span className="inline-flex items-center gap-1"><Clock size={11} /> {a.duration_min ?? 30} min</span>
                  {a.location && <span className="inline-flex items-center gap-1 truncate max-w-xs"><MapPin size={11} /> {a.location}</span>}
                </div>
                {notesClean && <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 line-clamp-2">{notesClean}</p>}
              </div>
              {isPending && (
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => onQuickStatus(a.id, 'scheduled', 'accepted')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition">
                    <CheckCircle2 size={12} /> Accept
                  </button>
                  <button onClick={() => onQuickStatus(a.id, 'rejected', 'rejected')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition">
                    <XCircle size={12} /> Reject
                  </button>
                </div>
              )}
              {!isPending && (a.status === 'scheduled' || a.status === 'completed') && (
                <Link
                  to={`/doctor/appointments/${a.id}`}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-xs font-semibold transition dark:bg-white dark:text-black"
                >
                  <Syringe size={12} /> {a.status === 'completed' ? 'View visit' : 'Open visit'}
                </Link>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/* ── helpers ── */
function buildMonthCells(year, month) {
  const first = new Date(year, month - 1, 1)
  const last  = new Date(year, month, 0)
  const start = new Date(first); start.setDate(first.getDate() - first.getDay())
  const end   = new Date(last);  end.setDate(last.getDate() + (6 - last.getDay()))
  const cells = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) cells.push(new Date(d))
  return cells
}

function toLocalDatetime(date, h, m) {
  const d = new Date(date)
  if (h != null) d.setHours(h, m ?? 0, 0, 0)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}