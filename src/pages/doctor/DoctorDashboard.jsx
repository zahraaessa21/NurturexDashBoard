// src/pages/doctor/DoctorDashboard.jsx
//
// Doctor's home screen, redesigned to match a reference analytics
// dashboard layout — KPI cards, chart grid, monthly summary table.
// The reference's month-grid calendar is replaced with an hour-by-hour
// view of TODAY (per request), driven by the doctor's own working hours.
// No sidebar/logo here — those live in the shared DashboardLayout shell.

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Baby, CalendarCheck, Syringe, FlaskConical, Clock, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'

import { useAuth }  from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { supabase } from '../../supabaseClient'
import { Skeleton } from '../../components/ui/Skeleton'
import EmptyState  from '../../components/EmptyState'

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function monthKey(d) { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` }
function last6MonthKeys() {
  const out = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTH_SHORT[d.getMonth()] })
  }
  return out
}

function pctChange(curr, prev) {
  if (prev === 0) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / prev) * 100)
}

function KpiCard({ icon: Icon, iconClass, change, value, label }) {
  const up = change >= 0
  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5">
      <div className="flex items-center justify-between mb-6">
        <div className={`w-10 h-10 rounded-xl grid place-items-center ${iconClass}`}>
          <Icon size={18} />
        </div>
        <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
          {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(change)}%
        </span>
      </div>
      <div className="text-2xl font-extrabold text-slate-900 dark:text-white">{value}</div>
      <div className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">{label}</div>
    </div>
  )
}

function ChartCard({ title, action, children, className = '' }) {
  return (
    <div className={`rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

/** Today's schedule, by hour, driven by the doctor's own working hours. */
function TodayHoursCard({ appts, workingHours }) {
  const now = new Date()
  const dayName = DAY_NAMES[now.getDay()]
  const todayRanges = (workingHours ?? []).filter(w => w.day === dayName)
  const startH = todayRanges.length ? parseInt(todayRanges[0].start, 10) : 8
  const endH   = todayRanges.length ? parseInt(todayRanges[todayRanges.length - 1].end, 10) : 18

  const byHour = {}
  for (const a of appts) {
    const d = new Date(a.scheduled_at)
    if (d.toDateString() !== now.toDateString()) continue
    const h = d.getHours()
    ;(byHour[h] ??= []).push(a)
  }

  const hours = []
  for (let h = startH; h <= endH; h++) hours.push(h)
  const currentHour = now.getHours()

  const fmtHour = (h) => {
    const period = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:00 ${period}`
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5 flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white">
          {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </h3>
      </div>
      <p className="text-xs text-slate-500 dark:text-zinc-500 mb-3">Today's schedule</p>

      {todayRanges.length === 0 ? (
        <div className="flex-1 grid place-items-center text-center py-6">
          <p className="text-xs text-slate-400 dark:text-zinc-600">You don't work today, per your profile hours.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto max-h-64 -mr-2 pr-2 space-y-1">
          {hours.map(h => {
            const items = byHour[h] ?? []
            const isNow = h === currentHour
            return (
              <div
                key={h}
                className={`flex items-center gap-3 rounded-lg px-2.5 py-2 ${isNow ? 'bg-brand-50 dark:bg-zinc-800' : ''}`}
              >
                <span className={`text-[11px] font-semibold w-16 shrink-0 ${isNow ? 'text-brand-700 dark:text-white' : 'text-slate-400 dark:text-zinc-500'}`}>
                  {fmtHour(h)}
                </span>
                <div className="flex-1 flex flex-wrap gap-1">
                  {items.length === 0 ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-zinc-700" />
                  ) : items.map(a => (
                    <span
                      key={a.id}
                      title={`${a.infant?.name ?? a.patient?.full_name ?? 'Patient'} — ${a.appt_type}`}
                      className={`w-2 h-2 rounded-full ${a.appt_type === 'vaccination' ? 'bg-purple-500' : 'bg-brand-600'}`}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800 text-[11px] text-slate-500 dark:text-zinc-500">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-600" /> Appointment</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500" /> Vaccination</span>
      </div>
    </div>
  )
}

export default function DoctorDashboard() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [infants,      setInfants]      = useState([])
  const [appointments, setAppointments] = useState([])
  const [vaccinations, setVaccinations] = useState([])
  const [labTests,     setLabTests]     = useState([])
  const [medications,  setMedications]  = useState([])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const sixMoAgo = new Date()
        sixMoAgo.setMonth(sixMoAgo.getMonth() - 6)
        sixMoAgo.setDate(1)

        const [infR, apptR, vaxR, labR, medR] = await Promise.all([
          supabase.from('infants').select('id, created_at').eq('doctor_id', user.id),
          supabase.from('appointments').select('id, scheduled_at, appt_type, infant:infant_id(id, name), patient:parent_id(id, full_name)').eq('doctor_id', user.id).gte('scheduled_at', sixMoAgo.toISOString()),
          supabase.from('vaccinations').select('id, administered_date, vaccine_name, status').eq('doctor_id', user.id),
          supabase.from('lab_tests').select('id, requested_at, status').eq('doctor_id', user.id),
          supabase.from('infant_medications').select('id, medication_name, created_at').eq('doctor_id', user.id),
        ])
        if (infR.error) throw infR.error
        if (apptR.error) throw apptR.error
        if (vaxR.error) throw vaxR.error
        if (labR.error) throw labR.error
        if (medR.error) throw medR.error
        if (cancelled) return

        setInfants(infR.data ?? [])
        setAppointments(apptR.data ?? [])
        setVaccinations(vaxR.data ?? [])
        setLabTests(labR.data ?? [])
        setMedications(medR.data ?? [])
      } catch (err) {
        if (!cancelled) toast.error(err.message ?? 'Could not load dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user, toast])

  const now = new Date()
  const thisMonthKey = monthKey(now)
  const lastMonthKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))

  // ── KPI cards ───────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const countByMonth = (rows, dateField) => {
      let thisM = 0, lastM = 0
      for (const r of rows) {
        if (!r[dateField]) continue
        const k = monthKey(r[dateField])
        if (k === thisMonthKey) thisM++
        else if (k === lastMonthKey) lastM++
      }
      return { thisM, lastM }
    }
    const infantsM = countByMonth(infants, 'created_at')
    const apptsM   = countByMonth(appointments, 'scheduled_at')
    const vaxAdministered = vaccinations.filter(v => v.status === 'administered')
    const vaxM     = countByMonth(vaxAdministered, 'administered_date')
    const labsM    = countByMonth(labTests, 'requested_at')

    return {
      infants: { value: infants.length, change: pctChange(infantsM.thisM, infantsM.lastM) },
      appts:   { value: apptsM.thisM, change: pctChange(apptsM.thisM, apptsM.lastM) },
      vax:     { value: vaxM.thisM, change: pctChange(vaxM.thisM, vaxM.lastM) },
      labs:    { value: labsM.thisM, change: pctChange(labsM.thisM, labsM.lastM) },
    }
  }, [infants, appointments, vaccinations, labTests, thisMonthKey, lastMonthKey])

  // ── Monthly Appointments (bar, last 6 months) ──────────────────
  const monthlyAppts = useMemo(() => {
    const buckets = last6MonthKeys()
    const counts = Object.fromEntries(buckets.map(b => [b.key, 0]))
    for (const a of appointments) {
      const k = monthKey(a.scheduled_at)
      if (k in counts) counts[k]++
    }
    return buckets.map(b => ({ month: b.label, count: counts[b.key] }))
  }, [appointments])

  // ── Vaccination stats by vaccine name (bar) ────────────────────
  const vaxByName = useMemo(() => {
    const counts = {}
    for (const v of vaccinations) {
      if (v.status !== 'administered') continue
      counts[v.vaccine_name] = (counts[v.vaccine_name] ?? 0) + 1
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name: name.length > 10 ? name.slice(0, 9) + '…' : name, count }))
  }, [vaccinations])

  // ── Lab test status (donut) ─────────────────────────────────────
  const labStatus = useMemo(() => {
    const counts = { pending: 0, reviewed: 0, completed: 0 }
    for (const t of labTests) counts[t.status] = (counts[t.status] ?? 0) + 1
    const total = labTests.length || 1
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) }))
  }, [labTests])
  const LAB_COLORS = { pending: '#F59E0B', reviewed: '#3B82F6', completed: '#10B981' }

  // ── Infant registration trend (bar, last 6 months) ──────────────
  const infantTrend = useMemo(() => {
    const buckets = last6MonthKeys()
    const counts = Object.fromEntries(buckets.map(b => [b.key, 0]))
    for (const i of infants) {
      const k = monthKey(i.created_at)
      if (k in counts) counts[k]++
    }
    return buckets.map(b => ({ month: b.label, count: counts[b.key] }))
  }, [infants])

  // ── Top prescriptions (progress bars) ────────────────────────────
  const topMeds = useMemo(() => {
    const counts = {}
    for (const m of medications) counts[m.medication_name] = (counts[m.medication_name] ?? 0) + 1
    const total = medications.length || 1
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, count]) => ({ name, pct: Math.round((count / total) * 100) }))
  }, [medications])

  // ── Activity overview — appointments per week, last 4 weeks (area) ─
  const weeklyActivity = useMemo(() => {
    const weeks = [0, 0, 0, 0]
    const start = new Date(); start.setDate(start.getDate() - 28); start.setHours(0, 0, 0, 0)
    for (const a of appointments) {
      const d = new Date(a.scheduled_at)
      const diffDays = Math.floor((d - start) / (24 * 3600 * 1000))
      const week = Math.floor(diffDays / 7)
      if (week >= 0 && week < 4) weeks[week]++
    }
    return weeks.map((count, i) => ({ week: `W${i + 1}`, count }))
  }, [appointments])

  // ── Monthly summary table (last 4 months, all real counts) ──────
  const summaryRows = useMemo(() => {
    const buckets = last6MonthKeys().slice(-4).reverse()
    const vaxAdministered = vaccinations.filter(v => v.status === 'administered')
    return buckets.map(b => ({
      label: b.key,
      monthLabel: new Date(`${b.key}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      newInfants:    infants.filter(i => monthKey(i.created_at) === b.key).length,
      appts:         appointments.filter(a => monthKey(a.scheduled_at) === b.key).length,
      vax:           vaxAdministered.filter(v => monthKey(v.administered_date) === b.key).length,
      labs:          labTests.filter(t => monthKey(t.requested_at) === b.key).length,
      meds:          medications.filter(m => monthKey(m.created_at) === b.key).length,
    }))
  }, [infants, appointments, vaccinations, labTests, medications])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-500 mt-1">
            Dr. {profile?.full_name?.split(' ')[0] ?? 'Doctor'} — an overview of your practice.
          </p>
        </div>
      </div>

      {/* ── Today's hours + KPI cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-4">
        <div className="sm:col-span-2 lg:col-span-2">
          <TodayHoursCard appts={appointments} workingHours={profile?.working_hours} />
        </div>
        <KpiCard icon={Baby}          iconClass="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"     change={kpis.infants.change} value={kpis.infants.value} label="Total Infants" />
        <KpiCard icon={CalendarCheck} iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" change={kpis.appts.change} value={kpis.appts.value} label="Appointments this month" />
        <KpiCard icon={Syringe}       iconClass="bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400" change={kpis.vax.change} value={kpis.vax.value} label="Vaccinations this month" />
        <KpiCard icon={FlaskConical} iconClass="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" change={kpis.labs.change} value={kpis.labs.value} label="Lab requests this month" />
      </div>

      {/* ── Chart grid row 1 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <ChartCard title="Monthly Appointments" action={
          <button onClick={() => navigate('/doctor/appointments')} className="text-xs font-semibold text-brand-700 dark:text-white hover:underline">Open →</button>
        }>
          {monthlyAppts.every(m => m.count === 0) ? <EmptyState icon={CalendarCheck} title="No data yet" /> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyAppts} margin={{ top: 10, right: 5, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-zinc-800" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="count" fill="#93C5FD" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Vaccination Stats" action={
          <button onClick={() => navigate('/doctor/vaccinations')} className="text-xs font-semibold text-brand-700 dark:text-white hover:underline">View →</button>
        }>
          {vaxByName.length === 0 ? <EmptyState icon={Syringe} title="No vaccinations yet" /> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vaxByName} margin={{ top: 10, right: 5, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-zinc-800" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'currentColor' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="count" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Lab Test Status">
          {labStatus.length === 0 ? <EmptyState icon={FlaskConical} title="No lab tests yet" /> : (
            <div className="flex items-center gap-4">
              <div className="h-40 w-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={labStatus} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={2}>
                      {labStatus.map((d, i) => <Cell key={i} fill={LAB_COLORS[d.name] ?? '#94A3B8'} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {labStatus.map(d => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: LAB_COLORS[d.name] ?? '#94A3B8' }} />
                    <span className="text-slate-600 dark:text-zinc-300 capitalize">{d.name}</span>
                    <span className="text-slate-400 dark:text-zinc-500">({d.pct}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Chart grid row 2 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <ChartCard title="Infant Registration">
          {infantTrend.every(m => m.count === 0) ? <EmptyState icon={Baby} title="No infants yet" /> : (
            <>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={infantTrend} margin={{ top: 10, right: 5, bottom: 0, left: -20 }}>
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'currentColor' }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {infantTrend.map((_, i) => <Cell key={i} fill={i === infantTrend.length - 1 ? '#1E40AF' : '#CBD5E1'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-slate-400 dark:text-zinc-600 text-center mt-2">Registrations over the last 6 months</p>
            </>
          )}
        </ChartCard>

        <ChartCard title="Top Prescriptions">
          {topMeds.length === 0 ? <EmptyState icon={FlaskConical} title="No prescriptions yet" /> : (
            <div className="space-y-4">
              {topMeds.map(m => (
                <div key={m.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700 dark:text-zinc-200 truncate">{m.name}</span>
                    <span className="text-slate-400 dark:text-zinc-500">{m.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                    <div className="h-full bg-brand-600 rounded-full" style={{ width: `${m.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Activity Overview" action={<span className="text-[11px] text-slate-400">Appointments / week</span>}>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyActivity} margin={{ top: 10, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={2} fill="url(#actGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* ── Monthly summary table ── */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-zinc-800">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">Monthly Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 dark:text-zinc-600 border-b border-slate-100 dark:border-zinc-800">
                <th className="px-5 py-3 font-semibold">Month</th>
                <th className="px-5 py-3 font-semibold">New Infants</th>
                <th className="px-5 py-3 font-semibold">Appointments</th>
                <th className="px-5 py-3 font-semibold">Vaccinations</th>
                <th className="px-5 py-3 font-semibold">Lab Tests</th>
                <th className="px-5 py-3 font-semibold">Medications</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {summaryRows.map(r => (
                <tr key={r.label}>
                  <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">{r.monthLabel}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300">{r.newInfants}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300">{r.appts}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300">{r.vax}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300">{r.labs}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300">{r.meds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
