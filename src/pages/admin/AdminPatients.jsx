// src/pages/admin/AdminPatients.jsx
//
// Mothers (patients) management for admins. Full CRUD + doctor assignment.

import { useEffect, useState, useCallback } from 'react'
import { Search, Pencil, Trash2, Users, RefreshCw, AlertCircle, Phone, Mail } from 'lucide-react'
import { patientService } from '../../services/patientService'
import { adminService }   from '../../services/adminService'
import { useToast } from '../../hooks/useToast'

import StatusBadge from '../../components/StatusBadge'
import EmptyState  from '../../components/EmptyState'
import Avatar      from '../../components/ui/Avatar'
import Modal       from '../../components/ui/Modal'
import Button      from '../../components/ui/Button'
import { Field, Input, Select } from '../../components/ui/Field'
import { SkeletonRow } from '../../components/ui/Skeleton'

const PAGE_SIZE = 10
const EMPTY_FORM = {
  full_name: '', email: '', phone: '', age: '', due_date: '',
  blood_type: '', notes: '', status: 'active', doctor_id: '',
}

export default function AdminPatients() {
  const toast = useToast()

  const [rows,    setRows]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [search,  setSearch]  = useState('')
  const [status,  setStatus]  = useState('all')
  const [loading, setLoading] = useState(true)
  const [doctors, setDoctors] = useState([])

  const [modalOpen, setModalOpen] = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { rows, total } = await patientService.list({ search, status, page, pageSize: PAGE_SIZE })
      setRows(rows); setTotal(total)
    } catch (err) {
      toast.error(err.message ?? 'Could not load patients')
    } finally {
      setLoading(false)
    }
  }, [search, status, page, toast])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, status])

  // Pre-load doctors list once
  useEffect(() => {
    adminService.listDoctorsForSelect().then(setDoctors).catch(() => {})
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const openCreate = () => {
    setEditing(null); setForm(EMPTY_FORM); setFormError(''); setModalOpen(true)
  }
  const openEdit = (p) => {
    setEditing(p)
    setForm({
      full_name: p.full_name ?? '',
      email:     p.email ?? '',
      phone:     p.phone ?? '',
      age:       p.age ?? '',
      due_date:  p.due_date ?? '',
      blood_type:p.blood_type ?? '',
      notes:     p.notes ?? '',
      status:    p.status ?? 'active',
      doctor_id: p.doctor_id ?? '',
    })
    setFormError(''); setModalOpen(true)
  }
  const closeModal = () => { if (!saving) setModalOpen(false) }

  const submit = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.full_name.trim()) return setFormError('Name is required.')
    setSaving(true)
    try {
      const payload = {
        ...form,
        doctor_id: form.doctor_id || null,
      }
      if (editing) {
        const updated = await patientService.update(editing.id, payload)
        setRows(prev => prev.map(r => r.id === editing.id ? { ...r, ...updated } : r))
        toast.success('Patient updated')
      } else {
        await patientService.create(payload)
        await load()
        toast.success('Patient added')
      }
      setModalOpen(false)
    } catch (err) {
      const msg = err.message ?? 'Save failed'
      setFormError(msg); toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await patientService.remove(deleteTarget.id)
      setRows(prev => prev.filter(r => r.id !== deleteTarget.id))
      setTotal(t => Math.max(0, t - 1))
      toast.success('Patient removed')
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err.message ?? 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Patients
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-500 mt-1">
            Mothers in the system. Assign each one to a doctor.
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 border-b border-slate-200 dark:border-zinc-800">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone…"
              className="block w-full h-10 pl-9 pr-3 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500"
            />
          </div>
          <div className="flex items-center gap-2">
            {['all', 'active', 'discharged', 'archived'].map(s => (
              <button
                key={s} onClick={() => setStatus(s)}
                className={
                  'px-3 h-9 rounded-full text-xs font-semibold capitalize transition border ' +
                  (status === s
                    ? 'bg-brand-700 text-white border-brand-700 dark:bg-white dark:text-black dark:border-white'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800 dark:hover:bg-zinc-800')
                }
              >{s}</button>
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
              <tr className="bg-slate-50 dark:bg-zinc-950">
                <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Patient</th>
                <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500 hidden md:table-cell">Doctor</th>
                <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500 hidden lg:table-cell">Contact</th>
                <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Status</th>
                <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500 hidden md:table-cell">Due</th>
                <th className="text-right px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
              ) : rows.length === 0 ? (
                <tr><td colSpan={6}>
                  <EmptyState
                    icon={Users}
                    title={search ? 'No patients match' : 'No patients yet'}
                    description={search ? 'Try a different search.' : 'Mothers will appear here once registered.'}
                  />
                </td></tr>
              ) : rows.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-zinc-950 transition">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={p.full_name} size="md" />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">{p.full_name}</div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-500 truncate">
                          {p.age ? `${p.age} yrs` : '—'} · {p.blood_type || '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell text-slate-600 dark:text-zinc-300">
                    {p.doctor?.full_name ? `Dr. ${p.doctor.full_name}` : <span className="text-slate-400">Unassigned</span>}
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-slate-600 dark:text-zinc-300">
                    <div className="space-y-0.5">
                      {p.email && <div className="text-xs flex items-center gap-1.5"><Mail size={11} className="text-slate-400" />{p.email}</div>}
                      {p.phone && <div className="text-xs flex items-center gap-1.5"><Phone size={11} className="text-slate-400" />{p.phone}</div>}
                    </div>
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge status={p.status} /></td>
                  <td className="px-5 py-3.5 hidden md:table-cell text-xs text-slate-500 dark:text-zinc-500">
                    {p.due_date ? new Date(p.due_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5 justify-end">
                      <Button variant="ghost" size="xs" onClick={() => openEdit(p)} title="Edit"><Pencil size={13} /></Button>
                      <Button variant="danger" size="xs" onClick={() => setDeleteTarget(p)} title="Delete"><Trash2 size={13} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
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
        onClose={closeModal}
        title={editing ? `Edit ${editing.full_name}` : 'Add new patient'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancel</Button>
            <Button onClick={submit} loading={saving}>{editing ? 'Save changes' : 'Add patient'}</Button>
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

          <Field label="Full name" required>
            <Input value={form.full_name} onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Jane Doe" disabled={saving} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} disabled={saving} />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} disabled={saving} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Age">
              <Input type="number" min={0} value={form.age} onChange={(e) => setForm(f => ({ ...f, age: e.target.value }))} disabled={saving} />
            </Field>
            <Field label="Due date">
              <Input type="date" value={form.due_date} onChange={(e) => setForm(f => ({ ...f, due_date: e.target.value }))} disabled={saving} />
            </Field>
            <Field label="Blood type">
              <Input value={form.blood_type} onChange={(e) => setForm(f => ({ ...f, blood_type: e.target.value }))} placeholder="e.g. O+" disabled={saving} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Assigned doctor">
              <Select value={form.doctor_id} onChange={(e) => setForm(f => ({ ...f, doctor_id: e.target.value }))} disabled={saving}>
                <option value="">— Unassigned —</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>Dr. {d.full_name}{d.specialty ? ` (${d.specialty})` : ''}</option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))} disabled={saving}>
                <option value="active">Active</option>
                <option value="discharged">Discharged</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="block w-full px-3.5 py-2.5 rounded-lg text-sm bg-white dark:bg-zinc-900 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-800 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 outline-none resize-y"
              disabled={saving}
            />
          </Field>
        </form>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        size="sm"
        title="Delete patient?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
          <span className="font-semibold">{deleteTarget?.full_name}</span> and all their associated records (infants, vaccinations, growth, alerts) will be permanently deleted. This cannot be undone.
        </p>
      </Modal>
    </>
  )
}
