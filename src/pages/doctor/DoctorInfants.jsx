// src/pages/doctor/DoctorInfants.jsx
//
// Table of infants under this doctor's care. Search by infant name, mother
// name, or mother email; filter by date added; full CRUD inline; plus
// quick actions to view an infant's full record (History) or message
// their mother.

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Baby, RefreshCw, AlertCircle, Pencil, Trash2, History, MessageSquare } from 'lucide-react'
import { useAuth }  from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { infantService }         from '../../services/infantService'
import { patientService }        from '../../services/patientService'
import { directMessageService }  from '../../services/directMessageService'

import EmptyState  from '../../components/EmptyState'
import StatusBadge from '../../components/StatusBadge'
import Button       from '../../components/ui/Button'
import Modal        from '../../components/ui/Modal'
import { Field, Input, Select } from '../../components/ui/Field'
import { SkeletonRow } from '../../components/ui/Skeleton'

const PAGE_SIZE = 10
const EMPTY_FORM = {
  parent_id: '', name: '', date_of_birth: '', gender: 'male',
  birth_weight_kg: '', birth_height_cm: '', blood_type: '', notes: '', status: 'monitoring',
}

export default function DoctorInfants() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [rows,    setRows]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [search,  setSearch]  = useState('')
  const [status,  setStatus]  = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [loading, setLoading] = useState(true)

  const [patients, setPatients] = useState([])
  const [messaging, setMessaging] = useState(null) // infant id currently opening a conversation

  const [modalOpen, setModalOpen] = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const { rows, total } = await infantService.list({
        doctorId: user.id, search, status, dateFrom, dateTo, page, pageSize: PAGE_SIZE,
      })
      setRows(rows); setTotal(total)
    } catch (err) {
      toast.error(err.message ?? 'Could not load infants')
    } finally {
      setLoading(false)
    }
  }, [user, search, status, dateFrom, dateTo, page, toast])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, status, dateFrom, dateTo])

  useEffect(() => {
    if (!user?.id) return
    patientService.list({ doctorId: user.id, pageSize: 1000 })
      .then(({ rows }) => setPatients(rows))
      .catch(() => {})
  }, [user])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (infant) => {
    setEditing(infant)
    setForm({
      parent_id: infant.parent?.id ?? '',
      name: infant.name ?? '',
      date_of_birth: infant.date_of_birth ?? '',
      gender: infant.gender ?? 'male',
      birth_weight_kg: infant.birth_weight_kg ?? '',
      birth_height_cm: infant.birth_height_cm ?? '',
      blood_type: infant.blood_type ?? '',
      notes: infant.notes ?? '',
      status: infant.status ?? 'monitoring',
    })
    setFormError('')
    setModalOpen(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) return setFormError('Name is required.')
    if (!form.date_of_birth) return setFormError('Date of birth is required — without it, no vaccination schedule can be generated for this infant.')
    setSaving(true)
    try {
      const payload = { ...form, parent_id: form.parent_id || null, doctor_id: user.id }
      if (editing) {
        await infantService.update(editing.id, payload)
        toast.success(`${form.name.trim()} updated`)
      } else {
        await infantService.create(payload)
        toast.success('Infant added')
      }
      await load()
      setModalOpen(false)
    } catch (err) {
      setFormError(err.message ?? 'Save failed')
      toast.error(err.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await infantService.remove(deleteTarget.id)
      setRows(prev => prev.filter(r => r.id !== deleteTarget.id))
      setTotal(t => Math.max(0, t - 1))
      toast.success(`${deleteTarget.name} removed`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err.message ?? 'Could not delete')
    } finally {
      setDeleting(false)
    }
  }

  const messageMother = async (infant) => {
    if (!infant.parent?.id) {
      toast.error('This infant has no mother on record to message.')
      return
    }
    setMessaging(infant.id)
    try {
      const convId = await directMessageService.getOrCreateConversation({
        parentId: infant.parent.id, doctorId: user.id,
      })
      navigate(`/doctor/messages?conv=${convId}`)
    } catch (err) {
      toast.error(err.message ?? 'Could not open conversation')
    } finally {
      setMessaging(null)
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Infants</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-500 mt-1">Infants under your care.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={14} /> Add infant
        </Button>
      </div>

      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 border-b border-slate-200 dark:border-zinc-800 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search infant, mother, or email…"
              className="block w-full h-10 pl-9 pr-3 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-500">
            <span>Added</span>
            <input
              type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 px-2 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-200 outline-none focus:border-brand-500"
            />
            <span>to</span>
            <input
              type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="h-9 px-2 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-200 outline-none focus:border-brand-500"
            />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-brand-700 dark:text-white font-semibold hover:underline">
                clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {['all', 'monitoring', 'healthy', 'at_risk', 'critical'].map(s => (
              <button
                key={s} onClick={() => setStatus(s)}
                className={
                  'px-3 h-9 rounded-full text-xs font-semibold capitalize transition border ' +
                  (status === s
                    ? 'bg-brand-700 text-white border-brand-700 dark:bg-white dark:text-black dark:border-white'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800 dark:hover:bg-zinc-800')
                }
              >{s.replace('_', ' ')}</button>
            ))}
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
          </div>

          <div className="sm:ml-auto text-xs text-slate-500 dark:text-zinc-500 whitespace-nowrap">{total} total</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-zinc-500 border-b border-slate-200 dark:border-zinc-800">
                <th className="px-5 py-3 font-medium">Infant</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Mother</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Mother email</th>
                <th className="px-5 py-3 font-medium hidden sm:table-cell">Date of birth</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Added</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
              ) : rows.length === 0 ? (
                <tr><td colSpan={7}>
                  <EmptyState
                    icon={Baby}
                    title={search ? 'No infants match' : 'No infants yet'}
                    description={search ? 'Try a different search.' : 'Click "Add infant" to register the first one.'}
                  />
                </td></tr>
              ) : (
                rows.map(i => (
                  <tr key={i.id} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900 dark:text-white">{i.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-500 capitalize">{i.gender ?? '—'}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300 hidden md:table-cell">
                      {i.parent?.full_name ?? <span className="text-slate-400">Unknown</span>}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-zinc-400 hidden lg:table-cell truncate max-w-[180px]">
                      {i.parent?.email ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300 hidden sm:table-cell">
                      {i.date_of_birth ? new Date(i.date_of_birth).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3.5"><StatusBadge status={i.status} /></td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-zinc-500 hidden md:table-cell">
                      {i.created_at ? new Date(i.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button variant="outline" size="xs" onClick={() => navigate(`/doctor/infants/${i.id}`)} title="Record / history">
                          <History size={13} />
                        </Button>
                        <Button variant="outline" size="xs" loading={messaging === i.id} onClick={() => messageMother(i)} title="Message mother">
                          <MessageSquare size={13} />
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => openEdit(i)} title="Edit">
                          <Pencil size={13} />
                        </Button>
                        <Button variant="danger" size="xs" onClick={() => setDeleteTarget(i)} title="Delete">
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && total > 0 && (
          <div className="px-5 py-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="text-xs text-slate-500 dark:text-zinc-500">
              Page {page} of {totalPages} — showing {rows.length} of {total}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</Button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Register new infant'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} loading={saving}>{editing ? 'Save changes' : 'Add infant'}</Button>
          </>
        }
      >
        <form onSubmit={submit}>
          {formError && (
            <div className="rounded-lg border-l-[3px] border-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-3 flex gap-2.5 text-sm text-red-700 dark:text-red-400 mb-4">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}
          <Field label="Name" required>
            <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Baby Smith" disabled={saving} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Date of birth" required hint="Required — drives the automatic vaccination schedule.">
              <Input type="date" value={form.date_of_birth} onChange={(e) => setForm(f => ({ ...f, date_of_birth: e.target.value }))} disabled={saving} />
            </Field>
            <Field label="Gender">
              <Select value={form.gender} onChange={(e) => setForm(f => ({ ...f, gender: e.target.value }))} disabled={saving}>
                <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Blood type"><Input value={form.blood_type} onChange={(e) => setForm(f => ({ ...f, blood_type: e.target.value }))} placeholder="e.g. O+" disabled={saving} /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Birth weight (kg)"><Input type="number" step="0.001" value={form.birth_weight_kg} onChange={(e) => setForm(f => ({ ...f, birth_weight_kg: e.target.value }))} disabled={saving} /></Field>
            <Field label="Birth height (cm)"><Input type="number" step="0.1" value={form.birth_height_cm} onChange={(e) => setForm(f => ({ ...f, birth_height_cm: e.target.value }))} disabled={saving} /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Mother (your patient)">
              <Select value={form.parent_id} onChange={(e) => setForm(f => ({ ...f, parent_id: e.target.value }))} disabled={saving}>
                <option value="">— Unknown —</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))} disabled={saving}>
                <option value="monitoring">Monitoring</option>
                <option value="healthy">Healthy</option>
                <option value="at_risk">At risk</option>
                <option value="critical">Critical</option>
              </Select>
            </Field>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        size="sm"
        title="Delete infant?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
          <span className="font-semibold">{deleteTarget?.name}</span> and all of their records (growth, vaccinations, feed logs) will be permanently removed. This cannot be undone.
        </p>
      </Modal>
    </>
  )
}