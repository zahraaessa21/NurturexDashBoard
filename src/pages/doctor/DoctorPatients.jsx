// src/pages/doctor/DoctorPatients.jsx
// Shows the doctor's assigned parents + their infants.
// Doctor can view details, message, and book appointments.

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Users, RefreshCw, MessageSquare,
  Baby, Phone, Mail, Calendar, ChevronRight, FileText,
} from 'lucide-react'
import { useAuth }  from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { patientService } from '../../services/patientService'
import { infantService }  from '../../services/infantService'

import EmptyState  from '../../components/EmptyState'
import Avatar      from '../../components/ui/Avatar'
import Button      from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { cn } from '../../utils/cn'

const PAGE_SIZE = 12

export default function DoctorPatients() {
  const { user } = useAuth()
  const toast    = useToast()
  const navigate = useNavigate()

  const [rows,    setRows]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const { rows, total } = await patientService.list({
        search, doctorId: user.id, page, pageSize: PAGE_SIZE,
      })
      // For each parent, fetch their infants
      const enriched = await Promise.all(rows.map(async (p) => {
        try {
          const { rows: inf } = await infantService.list({ doctorId: user.id, pageSize: 100 })
          // Filter infants belonging to this parent
          const myInfants = inf.filter(i => i.parent_id === p.id)
          return { ...p, infants: myInfants }
        } catch { return { ...p, infants: [] } }
      }))
      setRows(enriched)
      setTotal(total)
    } catch (err) {
      toast.error(err.message ?? 'Could not load patients')
    } finally {
      setLoading(false)
    }
  }, [user, search, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            My Patients
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-500 mt-0.5">
            Parents who have chosen you as their doctor
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-zinc-500 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5">
          <Users size={15} />
          <span className="font-bold text-slate-900 dark:text-white">{total}</span> patients
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email…"
          className="w-full h-10 pl-9 pr-4 rounded-lg text-sm bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-44 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No patients yet"
          description={search
            ? 'No patients match your search.'
            : 'When parents choose you as their doctor in the app, they appear here.'}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map(p => (
              <PatientCard
                key={p.id}
                patient={p}
                onMessage={() => navigate('/doctor/messages')}
                onAppointment={() => navigate('/doctor/appointments')}
                onInfant={(infantId) => navigate(`/doctor/infants/${infantId}`)}
                onRecord={() => navigate(`/doctor/patients/${p.id}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-slate-500">
                Page {page} of {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PatientCard({ patient, onMessage, onAppointment, onInfant, onRecord }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-brand-300 dark:hover:border-zinc-700 transition-all p-5">
      {/* Parent info */}
      <div className="flex items-start gap-3 mb-4">
        <Avatar src={patient.avatar_url} name={patient.full_name} size="md" />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-900 dark:text-white truncate">
            {patient.full_name ?? 'Unknown'}
          </h3>
          {patient.email && (
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-zinc-500 mt-0.5 truncate">
              <Mail size={10} />{patient.email}
            </div>
          )}
          {patient.phone && (
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-zinc-500 mt-0.5">
              <Phone size={10} />{patient.phone}
            </div>
          )}
        </div>
      </div>

      {/* Infants */}
      {patient.infants?.length > 0 && (
        <div className="mb-4 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-600 mb-2">
            Babies ({patient.infants.length})
          </p>
          {patient.infants.map(inf => (
            <button
              key={inf.id}
              onClick={() => onInfant(inf.id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-zinc-800 hover:bg-brand-50 dark:hover:bg-zinc-700 transition text-left group">
              <div className={cn(
                'w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-xs',
                inf.status === 'at_risk' ? 'bg-red-100 text-red-600' :
                inf.status === 'healthy' ? 'bg-green-100 text-green-600' :
                'bg-amber-100 text-amber-600'
              )}>
                <Baby size={12} />
              </div>
              <span className="flex-1 text-xs font-semibold text-slate-700 dark:text-zinc-300 truncate">
                {inf.name}
              </span>
              <ChevronRight size={12} className="text-slate-300 group-hover:text-brand-500 transition" />
            </button>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <button
        onClick={onRecord}
        className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-xs font-semibold transition mb-2">
        <FileText size={12} />View patient record
      </button>
      <div className="flex gap-2">
        <button
          onClick={onMessage}
          className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 text-brand-700 dark:text-brand-300 text-xs font-semibold transition">
          <MessageSquare size={12} />Message
        </button>
        <button
          onClick={onAppointment}
          className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 text-xs font-semibold transition">
          <Calendar size={12} />Appointment
        </button>
      </div>
    </div>
  )
}