// src/pages/doctor/DoctorMedicalNotes.jsx
//
// A read-only, searchable library of every medical note the doctor has
// ever written, across all patients. This is NOT where notes get
// authored — writing a note only happens from inside an appointment (the
// Appointment Details hub), so every note always traces back to the
// specific visit it was written during. This page is purely for finding
// and reviewing what's already there — toggling a note's parent-visibility
// or deleting one are the only mutations left here, since those are
// administrative, not clinical authoring.

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, Eye, EyeOff, Trash2,
  Search, AlertCircle, Calendar,
  Baby, Tag, Clock, ArrowRight,
} from 'lucide-react'

import { useAuth }  from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { medicalNoteService, VISIT_TYPES } from '../../services/medicalNoteService'
import { infantService } from '../../services/infantService'

import Modal       from '../../components/ui/Modal'
import Button      from '../../components/ui/Button'
import EmptyState  from '../../components/EmptyState'
import { cn } from '../../utils/cn'

const VISIT_COLORS = {
  routine:       'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  urgent:        'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  follow_up:     'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
  vaccination:   'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400',
  sick_visit:    'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400',
  new_born:      'bg-pink-50 text-pink-700 dark:bg-pink-500/10 dark:text-pink-400',
  developmental: 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400',
}

export default function DoctorMedicalNotes() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast    = useToast()

  const [notes,    setNotes]    = useState([])
  const [infants,  setInfants]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filterInfant, setFilterInfant] = useState('all')
  const [filterType,   setFilterType]   = useState('all')

  const [detailNote, setDetailNote] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [{ rows }, inf] = await Promise.all([
        medicalNoteService.list({ doctorId: user.id }),
        infantService.listForDoctor(user.id),
      ])
      setNotes(rows)
      setInfants(inf)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [user.id])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return notes.filter(n => {
      const matchSearch = !q ||
        n.title?.toLowerCase().includes(q) ||
        n.content?.toLowerCase().includes(q) ||
        n.infant?.name?.toLowerCase().includes(q) ||
        n.diagnosis?.toLowerCase().includes(q)
      const matchInfant = filterInfant === 'all' || n.infant_id === filterInfant
      const matchType   = filterType   === 'all' || n.visit_type === filterType
      return matchSearch && matchInfant && matchType
    })
  }, [notes, search, filterInfant, filterType])

  const toggleVisibility = async (note) => {
    try {
      const updated = await medicalNoteService.toggleVisibility(note.id, !note.is_parent_visible)
      setNotes(prev => prev.map(n => n.id === updated.id ? updated : n))
      toast.success(updated.is_parent_visible ? 'Visible to parent' : 'Hidden from parent')
    } catch (e) { toast.error(e.message) }
  }

  const deleteNote = async (id) => {
    if (!confirm('Delete this note? This cannot be undone.')) return
    try {
      await medicalNoteService.remove(id)
      setNotes(prev => prev.filter(n => n.id !== id))
      if (detailNote?.id === id) setDetailNote(null)
      toast.success('Note deleted')
    } catch (e) { toast.error(e.message) }
  }

  const visibleCount = notes.filter(n => n.is_parent_visible).length
  const todayCount   = notes.filter(n => {
    const d = new Date(n.created_at)
    const t = new Date()
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()
  }).length

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Medical Notes
        </h1>
        <p className="text-sm text-slate-500 dark:text-zinc-500 mt-0.5">
          Every note you've written, searchable in one place. New notes are written during an appointment, not here.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {[
          { label: 'Total notes', value: notes.length, icon: FileText, color: 'text-blue-600' },
          { label: 'Visible to parents', value: visibleCount, icon: Eye, color: 'text-green-600' },
          { label: 'Written today', value: todayCount, icon: Clock, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label}
            className="flex items-center gap-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-4 py-2.5">
            <s.icon size={15} className={s.color} />
            <span className="text-sm font-bold text-slate-900 dark:text-white">{s.value}</span>
            <span className="text-xs text-slate-500 dark:text-zinc-500">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search notes, infants, diagnoses…"
            className="w-full h-10 pl-9 pr-4 rounded-lg text-sm bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
          />
        </div>
        <select
          value={filterInfant}
          onChange={e => setFilterInfant(e.target.value)}
          className="h-10 pl-3 pr-8 rounded-lg text-sm bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white focus:outline-none cursor-pointer">
          <option value="all">All infants</option>
          {infants.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="h-10 pl-3 pr-8 rounded-lg text-sm bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white focus:outline-none cursor-pointer">
          <option value="all">All visit types</option>
          {VISIT_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No notes found"
          description={search || filterInfant !== 'all' || filterType !== 'all'
            ? 'Try adjusting your search or filters.'
            : "Notes you write during appointments will show up here automatically."}
        />
      ) : (
        <NotesTable
          notes={filtered}
          onDelete={deleteNote}
          onToggleVisibility={toggleVisibility}
          onDetail={setDetailNote}
        />
      )}

      {detailNote && (
        <NoteDetailModal
          note={detailNote}
          onClose={() => setDetailNote(null)}
          onOpenAppointment={detailNote.appointment_id ? () => navigate(`/doctor/appointments/${detailNote.appointment_id}`) : null}
        />
      )}
    </div>
  )
}

// ── Notes table ───────────────────────────────────────────────

function NotesTable({ notes, onDelete, onToggleVisibility, onDetail }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50">
              <th className="text-left font-bold text-[11px] uppercase tracking-wider text-slate-500 dark:text-zinc-500 px-4 py-3">Visit type</th>
              <th className="text-left font-bold text-[11px] uppercase tracking-wider text-slate-500 dark:text-zinc-500 px-4 py-3">Infant</th>
              <th className="text-left font-bold text-[11px] uppercase tracking-wider text-slate-500 dark:text-zinc-500 px-4 py-3">Title / Diagnosis</th>
              <th className="text-left font-bold text-[11px] uppercase tracking-wider text-slate-500 dark:text-zinc-500 px-4 py-3">Date</th>
              <th className="text-left font-bold text-[11px] uppercase tracking-wider text-slate-500 dark:text-zinc-500 px-4 py-3">Visibility</th>
              <th className="text-right font-bold text-[11px] uppercase tracking-wider text-slate-500 dark:text-zinc-500 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
            {notes.map((note) => {
              const visitType = VISIT_TYPES.find(v => v.value === note.visit_type)
              const colorClass = VISIT_COLORS[note.visit_type] ?? VISIT_COLORS.routine
              return (
                <tr key={note.id}
                  className="group hover:bg-slate-50 dark:hover:bg-zinc-950/50 transition-colors cursor-pointer"
                  onClick={() => onDetail(note)}>
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', colorClass)}>
                      <Tag size={9} />{visitType?.label ?? note.visit_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    {note.infant ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300">
                        <Baby size={12} className="text-slate-400" />{note.infant.name}
                      </span>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 align-top max-w-xs">
                    <div className="font-bold text-slate-900 dark:text-white text-sm leading-snug truncate">{note.title}</div>
                    {note.diagnosis && (
                      <div className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5 truncate">Dx: {note.diagnosis}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-500">
                      <Calendar size={11} />
                      {new Date(note.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-zinc-600 mt-0.5">
                      {new Date(note.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    {note.is_parent_visible ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
                        <Eye size={11} />Visible
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-zinc-600">
                        <EyeOff size={11} />Hidden
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleVisibility(note) }}
                        title={note.is_parent_visible ? 'Hide from parent' : 'Share with parent'}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-white transition-colors">
                        {note.is_parent_visible ? <Eye size={14}/> : <EyeOff size={14}/>}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(note.id) }}
                        title="Delete note"
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                        <Trash2 size={14}/>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDetail(note) }}
                        title="View note"
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-white transition-colors">
                        <ArrowRight size={14}/>
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Note detail modal (read-only) ───────────────────────────────

function NoteDetailModal({ note, onClose, onOpenAppointment }) {
  const visitType  = VISIT_TYPES.find(v => v.value === note.visit_type)
  const colorClass = VISIT_COLORS[note.visit_type] ?? VISIT_COLORS.routine

  return (
    <Modal open={!!note} onClose={onClose} title="Medical note" size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {onOpenAppointment && (
            <Button onClick={onOpenAppointment}>View appointment <ArrowRight size={13}/></Button>
          )}
        </>
      }>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <span className={cn('inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full', colorClass)}>
            <Tag size={11}/>{visitType?.label ?? note.visit_type}
          </span>
          {note.infant && (
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-2.5 py-1 rounded-full">
              <Baby size={11}/>{note.infant.name}
            </span>
          )}
          <span className={cn(
            'inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full',
            note.is_parent_visible
              ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400'
              : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-500'
          )}>
            {note.is_parent_visible ? <><Eye size={11}/>Visible to parent</> : <><EyeOff size={11}/>Hidden</>}
          </span>
        </div>

        <div>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{note.title}</h2>
          {note.diagnosis && (
            <p className="text-sm text-slate-500 dark:text-zinc-500 mt-0.5">
              Diagnosis: <span className="font-medium text-slate-700 dark:text-zinc-300">{note.diagnosis}</span>
            </p>
          )}
          <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-1">
            {note.doctor?.full_name ? `Dr. ${note.doctor.full_name}` : 'Unknown doctor'}
            {' · '}
            {new Date(note.created_at).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 p-4">
          <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">{note.content}</p>
        </div>

        {note.recommendations && (
          <div className="rounded-xl bg-brand-50 dark:bg-zinc-950 border-l-4 border-brand-500 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400 mb-1">Recommendations</p>
            <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">{note.recommendations}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}