// src/pages/admin/AdminDashboard.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stethoscope, UserCheck, Sparkles, ShieldCheck,
  Users, Baby, Bell, Syringe,
} from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

import { adminService }       from '../../services/adminService'
import { vaccinationService } from '../../services/vaccinationService'
import { useToast } from '../../hooks/useToast'

import StatCard      from '../../components/StatCard'
import StatusBadge   from '../../components/StatusBadge'
import EmptyState    from '../../components/EmptyState'
import Avatar        from '../../components/ui/Avatar'
import { SkeletonStatCard, Skeleton } from '../../components/ui/Skeleton'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const toast = useToast()

  const [stats,        setStats]        = useState(null)
  const [growth,       setGrowth]       = useState([])
  const [recent,       setRecent]       = useState([])
  const [upcomingVax,  setUpcomingVax]  = useState([])
  const [loading,      setLoading]      = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [s, g, r, v] = await Promise.all([
        adminService.getStats(),
        adminService.getMonthlyGrowth(),
        adminService.listDoctors({ pageSize: 5 }),
        vaccinationService.upcoming({ days: 14, limit: 5 }),
      ])
      setStats(s); setGrowth(g); setRecent(r.rows); setUpcomingVax(v)
    } catch (err) {
      toast.error(err.message ?? 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Admin dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-500 mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400">
            <ShieldCheck size={12} /> Admin View
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading ? (
          <>{Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}</>
        ) : (
          <>
            <StatCard icon={Stethoscope} label="Doctors" value={stats.doctorsTotal} iconClass="bg-brand-50 text-brand-700 dark:bg-zinc-800 dark:text-zinc-200" />
            <StatCard icon={UserCheck}   label="Active doctors" value={stats.doctorsActive} iconClass="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" />
            <StatCard icon={Users}       label="Patients (mothers)" value={stats.patientsTotal} iconClass="bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400" />
            <StatCard icon={Baby}        label="Infants" value={stats.infantsTotal} iconClass="bg-pink-50 text-pink-700 dark:bg-pink-500/10 dark:text-pink-400" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Growth chart */}
        <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white">Doctors added</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-500">Last 6 months</p>
            </div>
            <button onClick={() => navigate('/admin/reports')} className="text-xs font-semibold text-brand-700 dark:text-white hover:underline">
              See all reports →
            </button>
          </div>
          {loading ? <Skeleton className="h-64" /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growth} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="cFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-zinc-800" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} cursor={{ stroke: '#2563EB', strokeOpacity: .25, strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={2} fill="url(#cFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Recent doctors */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-900 dark:text-white">Recent doctors</h2>
            <button onClick={() => navigate('/admin/doctors')} className="text-xs font-semibold text-brand-700 dark:text-white hover:underline">View all →</button>
          </div>
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12" />)}</div>
          ) : recent.length === 0 ? (
            <EmptyState icon={Stethoscope} title="No doctors yet" description="Click 'Add doctor' to create the first." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-zinc-800 -mx-1">
              {recent.map(d => (
                <li key={d.id} className="flex items-center gap-3 py-2.5 px-1">
                  <Avatar src={d.avatar_url} name={d.full_name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">Dr. {d.full_name ?? 'Unnamed'}</div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-500 truncate">{d.specialty ?? d.email}</div>
                  </div>
                  <StatusBadge status={d.status ?? 'active'} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Upcoming vaccinations */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white">Upcoming vaccinations</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-500">Next 14 days</p>
            </div>
            <Syringe size={16} className="text-slate-400" />
          </div>
          {loading ? <Skeleton className="h-32" />
          : upcomingVax.length === 0 ? (
            <EmptyState icon={Syringe} title="No vaccinations upcoming" />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
              {upcomingVax.map(v => (
                <li key={v.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{v.vaccine_name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-500">{v.infant?.name ?? '—'}</div>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-zinc-300">{new Date(v.scheduled_date).toLocaleDateString()}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
