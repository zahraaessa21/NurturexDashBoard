// src/pages/admin/AdminReports.jsx
//
// Admin Reports, redesigned to match the doctor dashboard's visual
// language: KPI cards with real month-over-month % change, then a chart
// grid, then a monthly summary table. Everything here is system-wide
// (every doctor, every infant) rather than scoped to one doctor.

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stethoscope, Users, Baby, CalendarCheck, ArrowUpRight, ArrowDownRight, FlaskConical,
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'

import { supabase } from '../../supabaseClient'
import { useToast } from '../../hooks/useToast'
import { Skeleton } from '../../components/ui/Skeleton'
import EmptyState  from '../../components/EmptyState'

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const STATUS_COLORS = { monitoring: '#F59E0B', healthy: '#10B981', at_risk: '#FB923C', critical: '#EF4444' }
const VAX_COLORS    = { scheduled: '#3B82F6', administered: '#10B981', overdue: '#EF4444', skipped: '#94A3B8' }
const LAB_COLORS    = { pending: '#F59E0B', reviewed: '#3B82F6', completed: '#10B981' }
const SPECIALTY_COLORS = ['#2563EB', '#7C3AED', '#0EA5E9', '#F59E0B', '#10B981', '#EF4444']

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

function ChartCard({ title, subtitle, action, children, wide }) {
  return (
    <div className={'rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5 ' + (wide ? 'lg:col-span-2' : '')}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-zinc-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export default function AdminReports() {
  const toast = useToast()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)

  const [doctors,      setDoctors]      = useState([])
  const [parents,      setParents]      = useState([])
  const [infants,      setInfants]      = useState([])
  const [appointments, setAppointments] = useState([])
  const [vaccinations, setVaccinations] = useState([])
  const [labTests,     setLabTests]     = useState([])
  const [medications,  setMedications]  = useState([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const sixMoAgo = new Date(); sixMoAgo.setMonth(sixMoAgo.getMonth() - 6); sixMoAgo.setDate(1)

        const [docR, parR, infR, apptR, vaxR, labR, medR] = await Promise.all([
          supabase.from('profiles').select('id, created_at, specialty').eq('role', 'doctor'),
          supabase.from('profiles').select('id, created_at').eq('role', 'parent'),
          supabase.from('infants').select('id, created_at, status'),
          supabase.from('appointments').select('id, scheduled_at, doctor:doctor_id(full_name)').gte('scheduled_at', sixMoAgo.toISOString()),
          supabase.from('vaccinations').select('id, administered_date, status'),
          supabase.from('lab_tests').select('id, requested_at, status'),
          supabase.from('infant_medications').select('id, medication_name, created_at'),
        ])
        if (docR.error) throw docR.error
        if (parR.error) throw parR.error
        if (infR.error) throw infR.error
        if (apptR.error) throw apptR.error
        if (vaxR.error) throw vaxR.error
        if (labR.error) throw labR.error
        if (medR.error) throw medR.error
        if (cancelled) return

        setDoctors(docR.data ?? [])
        setParents(parR.data ?? [])
        setInfants(infR.data ?? [])
        setAppointments(apptR.data ?? [])
        setVaccinations(vaxR.data ?? [])
        setLabTests(labR.data ?? [])
        setMedications(medR.data ?? [])
      } catch (err) {
        if (!cancelled) toast.error(err.message ?? 'Could not load reports')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [toast])

  const now = new Date()
  const thisMonthKey = monthKey(now)
  const lastMonthKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))

  // ── KPI cards ───────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const countByMonth = (rows, field) => {
      let thisM = 0, lastM = 0
      for (const r of rows) {
        if (!r[field]) continue
        const k = monthKey(r[field])
        if (k === thisMonthKey) thisM++
        else if (k === lastMonthKey) lastM++
      }
      return { thisM, lastM }
    }
    const docM  = countByMonth(doctors, 'created_at')
    const parM  = countByMonth(parents, 'created_at')
    const infM  = countByMonth(infants, 'created_at')
    const apptM = countByMonth(appointments, 'scheduled_at')

    return {
      doctors: { value: doctors.length, change: pctChange(docM.thisM, docM.lastM) },
      parents: { value: parents.length, change: pctChange(parM.thisM, parM.lastM) },
      infants: { value: infants.length, change: pctChange(infM.thisM, infM.lastM) },
      appts:   { value: apptM.thisM, change: pctChange(apptM.thisM, apptM.lastM) },
    }
  }, [doctors, parents, infants, appointments, thisMonthKey, lastMonthKey])

  // ── Doctors added (area, 6mo) ────────────────────────────────────
  const doctorGrowth = useMemo(() => {
    const buckets = last6MonthKeys()
    const counts = Object.fromEntries(buckets.map(b => [b.key, 0]))
    for (const d of doctors) { const k = monthKey(d.created_at); if (k in counts) counts[k]++ }
    return buckets.map(b => ({ month: b.label, count: counts[b.key] }))
  }, [doctors])

  // ── Doctors by specialty (pie) ────────────────────────────────────
  const specialtyBreakdown = useMemo(() => {
    const counts = {}
    for (const d of doctors) {
      const key = d.specialty?.trim() || 'Unspecified'
      counts[key] = (counts[key] ?? 0) + 1
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [doctors])

  // ── Appointments per doctor (bar, top 10) ────────────────────────
  const apptsByDoctor = useMemo(() => {
    const counts = {}
    for (const a of appointments) {
      const name = a.doctor?.full_name ? `Dr. ${a.doctor.full_name}` : 'Unassigned'
      counts[name] = (counts[name] ?? 0) + 1
    }
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10)
  }, [appointments])

  // ── Infant status (pie) ───────────────────────────────────────────
  const infantStatusData = useMemo(() => {
    const counts = { monitoring: 0, healthy: 0, at_risk: 0, critical: 0 }
    for (const i of infants) counts[i.status] = (counts[i.status] ?? 0) + 1
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name: name.replace('_', ' '), value, color: STATUS_COLORS[name] }))
  }, [infants])

  // ── Vaccination status (pie) ──────────────────────────────────────
  const vaxBreakdown = useMemo(() => {
    const counts = { scheduled: 0, administered: 0, overdue: 0, skipped: 0 }
    for (const v of vaccinations) counts[v.status] = (counts[v.status] ?? 0) + 1
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }))
  }, [vaccinations])

  // ── Lab test status (donut) ───────────────────────────────────────
  const labStatus = useMemo(() => {
    const counts = { pending: 0, reviewed: 0, completed: 0 }
    for (const t of labTests) counts[t.status] = (counts[t.status] ?? 0) + 1
    const total = labTests.length || 1
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) }))
  }, [labTests])

  // ── Monthly appointments (bar, 6mo, system-wide) ──────────────────
  const monthlyAppts = useMemo(() => {
    const buckets = last6MonthKeys()
    const counts = Object.fromEntries(buckets.map(b => [b.key, 0]))
    for (const a of appointments) { const k = monthKey(a.scheduled_at); if (k in counts) counts[k]++ }
    return buckets.map(b => ({ month: b.label, count: counts[b.key] }))
  }, [appointments])

  // ── Top prescriptions (progress bars) ─────────────────────────────
  const topMeds = useMemo(() => {
    const counts = {}
    for (const m of medications) counts[m.medication_name] = (counts[m.medication_name] ?? 0) + 1
    const total = medications.length || 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, pct: Math.round((count / total) * 100) }))
  }, [medications])

  // ── Activity overview — appointments per week, last 4 weeks ────────
  const weeklyActivity = useMemo(() => {
    const weeks = [0, 0, 0, 0]
    const start = new Date(); start.setDate(start.getDate() - 28); start.setHours(0, 0, 0, 0)
    for (const a of appointments) {
      const d = new Date(a.scheduled_at)
      const week = Math.floor((d - start) / (7 * 24 * 3600 * 1000))
      if (week >= 0 && week < 4) weeks[week]++
    }
    return weeks.map((count, i) => ({ week: `W${i + 1}`, count }))
  }, [appointments])

  // ── Monthly summary table ─────────────────────────────────────────
  const summaryRows = useMemo(() => {
    const buckets = last6MonthKeys().slice(-4).reverse()
    const vaxAdministered = vaccinations.filter(v => v.status === 'administered')
    return buckets.map(b => ({
      key: b.key,
      label: new Date(`${b.key}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      newDoctors: doctors.filter(d => monthKey(d.created_at) === b.key).length,
      newInfants: infants.filter(i => monthKey(i.created_at) === b.key).length,
      appts:      appointments.filter(a => monthKey(a.scheduled_at) === b.key).length,
      vax:        vaxAdministered.filter(v => monthKey(v.administered_date) === b.key).length,
      labs:       labTests.filter(t => monthKey(t.requested_at) === b.key).length,
      meds:       medications.filter(m => monthKey(m.created_at) === b.key).length,
    }))
  }, [doctors, infants, appointments, vaccinations, labTests, medications])

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
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Reports</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-500 mt-1">System-wide activity across every doctor and patient.</p>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard icon={Stethoscope}   iconClass="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"       change={kpis.doctors.change} value={kpis.doctors.value} label="Total Doctors" />
        <KpiCard icon={Users}         iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" change={kpis.parents.change} value={kpis.parents.value} label="Total Mothers" />
        <KpiCard icon={Baby}          iconClass="bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400"     change={kpis.infants.change} value={kpis.infants.value} label="Total Infants" />
        <KpiCard icon={CalendarCheck} iconClass="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"             change={kpis.appts.change} value={kpis.appts.value} label="Appointments this month" />
      </div>

      {/* ── Chart grid row 1 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <ChartCard title="Doctors added" subtitle="Last 6 months">
          {doctorGrowth.every(m => m.count === 0) ? <EmptyState icon={Stethoscope} title="No data yet" /> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={doctorGrowth} margin={{ top: 10, right: 5, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="docGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563EB" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-zinc-800" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Area type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={2} fill="url(#docGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Doctors by specialty">
          {specialtyBreakdown.length === 0 ? <EmptyState icon={Stethoscope} title="No doctors yet" /> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={specialtyBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {specialtyBreakdown.map((entry, i) => <Cell key={i} fill={SPECIALTY_COLORS[i % SPECIALTY_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Appointments per doctor" subtitle="Top 10">
          {apptsByDoctor.length === 0 ? <EmptyState icon={CalendarCheck} title="No appointments yet" /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={apptsByDoctor} margin={{ top: 10, right: 10, bottom: 40, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-zinc-800" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'currentColor' }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="count" fill="#2563EB" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Monthly Appointments" subtitle="Last 6 months, all doctors">
          {monthlyAppts.every(m => m.count === 0) ? <EmptyState icon={CalendarCheck} title="No data yet" /> : (
            <div className="h-64">
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
      </div>

      {/* ── Chart grid row 3 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <ChartCard title="Infant status distribution">
          {infantStatusData.length === 0 ? <EmptyState icon={Baby} title="No infants yet" /> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={infantStatusData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {infantStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Vaccination status">
          {vaxBreakdown.length === 0 ? <EmptyState icon={Baby} title="No vaccination records yet" /> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={vaxBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {vaxBreakdown.map((entry, i) => <Cell key={i} fill={VAX_COLORS[entry.name] ?? '#94A3B8'} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Top Prescriptions" subtitle="System-wide">
          {topMeds.length === 0 ? <EmptyState icon={FlaskConical} title="No prescriptions yet" /> : (
            <div className="space-y-4 py-1">
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
      </div>

      {/* ── Activity overview (full width) ── */}
      <ChartCard title="Activity Overview" subtitle="Appointments per week, last 4 weeks, all doctors">
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyActivity} margin={{ top: 10, right: 5, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="actGradAdmin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-zinc-800" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Area type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={2} fill="url(#actGradAdmin)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* ── Monthly summary table ── */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden mt-4">
        <div className="p-5 border-b border-slate-200 dark:border-zinc-800">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">Monthly Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 dark:text-zinc-600 border-b border-slate-100 dark:border-zinc-800">
                <th className="px-5 py-3 font-semibold">Month</th>
                <th className="px-5 py-3 font-semibold">New Doctors</th>
                <th className="px-5 py-3 font-semibold">New Infants</th>
                <th className="px-5 py-3 font-semibold">Appointments</th>
                <th className="px-5 py-3 font-semibold">Vaccinations</th>
                <th className="px-5 py-3 font-semibold">Lab Tests</th>
                <th className="px-5 py-3 font-semibold">Medications</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {summaryRows.map(r => (
                <tr key={r.key}>
                  <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">{r.label}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300">{r.newDoctors}</td>
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
