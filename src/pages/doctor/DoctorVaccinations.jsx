// src/pages/doctor/DoctorVaccinations.jsx
//
// The doctor's cross-patient vaccine worklist — NOT where vaccines get
// marked as given (that only happens through an appointment visit, on the
// Appointment Details hub, so it stays linked to a doctor, a date, and
// notifies the parent). This screen exists for a different job: catching
// infants who are overdue *before* an appointment ever gets booked —
// automatic reminders tell the parent, this screen is where the doctor
// can see who hasn't followed through and personally nudge them or reach
// out directly.

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Syringe, Bell, MessageSquare, RefreshCw, ChevronRight, AlertTriangle, Search } from 'lucide-react'
import { useAuth }  from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { supabase } from '../../supabaseClient'
import { directMessageService } from '../../services/directMessageService'

import StatusBadge from '../../components/StatusBadge'
import EmptyState  from '../../components/EmptyState'
import Button      from '../../components/ui/Button'
import { SkeletonRow } from '../../components/ui/Skeleton'

export default function DoctorVaccinations() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('overdue')   // overdue | upcoming | administered | all
  const [busyId,  setBusyId]  = useState(null) // row currently sending a reminder / opening a chat
  const [search,  setSearch]  = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('vaccinations')
        .select('*, infant:infant_id(id, name, doctor_id, parent:parent_id(id, full_name, phone))')
        .order('scheduled_date', { ascending: true })
      if (error) throw error
      let result = (data ?? []).filter(v => v.infant?.doctor_id === user.id)

      const today = new Date().toISOString().slice(0, 10)
      if (filter === 'upcoming') {
        result = result.filter(v => v.status === 'scheduled' && (!v.scheduled_date || v.scheduled_date >= today))
      } else if (filter === 'overdue') {
        result = result.filter(v => v.status === 'scheduled' && v.scheduled_date && v.scheduled_date < today)
      } else if (filter === 'administered') {
        result = result.filter(v => v.status === 'administered')
      }
      setRows(result)
    } catch (err) {
      toast.error(err.message ?? 'Could not load vaccinations')
    } finally {
      setLoading(false)
    }
  }, [user, filter, toast])

  useEffect(() => { load() }, [load])

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(v => {
      if (q && !(v.vaccine_name?.toLowerCase().includes(q) || v.infant?.name?.toLowerCase().includes(q))) return false
      if (dateFrom && (!v.scheduled_date || v.scheduled_date < dateFrom)) return false
      if (dateTo && (!v.scheduled_date || v.scheduled_date > dateTo)) return false
      return true
    })
  }, [rows, search, dateFrom, dateTo])

  const today = new Date().toISOString().slice(0, 10)

  const sendReminder = async (v) => {
    const parentId = v.infant?.parent?.id
    if (!parentId) { toast.error('No parent on file for this infant.'); return }
    setBusyId(v.id)
    try {
      const { error } = await supabase.from('notification_history').insert({
        user_id: parentId,
        type: 'vaccination',
        title: `Reminder: ${v.vaccine_name} is due`,
        body: `${v.infant?.name ?? 'Your baby'} is due for ${v.vaccine_name}${v.dose_number ? ` (Dose ${v.dose_number})` : ''}. Please book an appointment.`,
        payload: { vaccination_id: v.id },
      })
      if (error) throw error
      toast.success('Reminder sent to the mother')
    } catch (err) {
      toast.error(err.message ?? 'Could not send reminder')
    } finally {
      setBusyId(null)
    }
  }

  const messageParent = async (v) => {
    const parentId = v.infant?.parent?.id
    if (!parentId) { toast.error('No parent on file for this infant.'); return }
    setBusyId(v.id)
    try {
      const convId = await directMessageService.getOrCreateConversation({ parentId, doctorId: user.id })
      navigate(`/doctor/messages?conv=${convId}`)
    } catch (err) {
      toast.error(err.message ?? 'Could not open conversation')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Vaccinations</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-500 mt-1 max-w-xl">
            Who's overdue or coming up across all your patients — catch it before it becomes a missed appointment.
            Vaccines are only ever marked given from inside an actual visit.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>

      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-2 flex-wrap">
          {[
            { key: 'overdue',      label: 'Overdue' },
            { key: 'upcoming',     label: 'Upcoming' },
            { key: 'administered', label: 'Administered' },
            { key: 'all',          label: 'All' },
          ].map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={'px-3 h-9 rounded-full text-xs font-semibold transition border ' +
                (filter === t.key
                  ? 'bg-brand-700 text-white border-brand-700 dark:bg-white dark:text-black dark:border-white'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800 dark:hover:bg-zinc-800')}>
              {t.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500 dark:text-zinc-500">{visibleRows.length} record{visibleRows.length === 1 ? '' : 's'}</span>
        </div>

        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-zinc-800 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vaccine or infant name…"
              className="block w-full h-9 pl-9 pr-3 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-500">
            <span>Due date</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 px-2 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-200 outline-none focus:border-brand-500" />
            <span>to</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="h-9 px-2 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-200 outline-none focus:border-brand-500" />
            {(search || dateFrom || dateTo) && (
              <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }} className="text-brand-700 dark:text-white font-semibold hover:underline">
                clear
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-zinc-950">
                <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Vaccine</th>
                <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Infant</th>
                <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Due</th>
                <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Status</th>
                <th className="text-right px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Follow up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {loading ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
              : visibleRows.length === 0 ? (
                <tr><td colSpan={5}>
                  <EmptyState icon={Syringe} title="Nothing here" description="Try a different search or filter." />
                </td></tr>
              ) : visibleRows.map(v => {
                const isOverdue = v.status === 'scheduled' && v.scheduled_date && v.scheduled_date < today
                const isBusy = busyId === v.id
                return (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-zinc-950 transition">
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">
                      {v.vaccine_name}{v.dose_number ? ` — Dose ${v.dose_number}` : ''}
                    </td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => navigate(`/doctor/infants/${v.infant?.id}`)} className="inline-flex items-center gap-1 text-brand-700 dark:text-white hover:underline">
                        {v.infant?.name ?? '—'}<ChevronRight size={12} />
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300">
                      {v.scheduled_date ? new Date(v.scheduled_date).toLocaleDateString() : '—'}
                      {isOverdue && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400">
                          <AlertTriangle size={11} /> overdue
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={v.status === 'administered' ? 'completed' : (isOverdue ? 'overdue' : v.status)} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {v.status !== 'administered' && (
                        <div className="inline-flex items-center gap-1.5">
                          <Button variant="ghost" size="xs" loading={isBusy} onClick={() => sendReminder(v)} title="Send reminder">
                            <Bell size={12} /> Remind
                          </Button>
                          <Button variant="ghost" size="xs" loading={isBusy} onClick={() => messageParent(v)} title="Message mother">
                            <MessageSquare size={12} />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
