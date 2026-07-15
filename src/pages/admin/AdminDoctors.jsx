// src/pages/admin/AdminDoctors.jsx
//
// Full doctor management:
//   - Searchable + status-filtered list
//   - Pagination (10 per page by default)
//   - Add / Edit / Delete with confirmation modal
//   - Profile image upload (Supabase Storage)

import { useEffect, useState, useCallback } from 'react'
import { Search, Pencil, Trash2, Stethoscope, RefreshCw, AlertCircle, Phone, Mail } from 'lucide-react'
import { adminService } from '../../services/adminService'
import { useToast } from '../../hooks/useToast'

import StatusBadge   from '../../components/StatusBadge'
import EmptyState    from '../../components/EmptyState'
import Avatar        from '../../components/ui/Avatar'
import Modal         from '../../components/ui/Modal'
import Button        from '../../components/ui/Button'
import { Field, Input, Select } from '../../components/ui/Field'
import ImageUpload   from '../../components/ui/ImageUpload'
import { SkeletonRow } from '../../components/ui/Skeleton'

const PAGE_SIZE = 10
const EMPTY_FORM = {
  full_name: '', email: '', password: '', phone: '',
  specialty: '', status: 'active',
}

export default function AdminDoctors() {
  const toast = useToast()

  const [rows,    setRows]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [search,  setSearch]  = useState('')
  const [status,  setStatus]  = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [loading, setLoading] = useState(true)

  // Form modal
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [avatarFile, setAvatarFile] = useState(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [formError,  setFormError]  = useState('')

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { rows, total } = await adminService.listDoctors({
        search, status, dateFrom, dateTo, page, pageSize: PAGE_SIZE,
      })
      setRows(rows); setTotal(total)
    } catch (err) {
      toast.error(err.message ?? 'Could not load doctors')
    } finally {
      setLoading(false)
    }
  }, [search, status, dateFrom, dateTo, page, toast])

  useEffect(() => { load() }, [load])

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1) }, [search, status, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  /* ── Form handlers ── */
  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setAvatarFile(null)
    setRemoveAvatar(false)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (d) => {
    setEditing(d)
    setForm({
      full_name: d.full_name ?? '',
      email:     d.email ?? '',
      password:  '',
      phone:     d.phone ?? '',
      specialty: d.specialty ?? '',
      status:    d.status ?? 'active',
    })
    setAvatarFile(null)
    setRemoveAvatar(false)
    setFormError('')
    setModalOpen(true)
  }

  const closeModal = () => { if (!saving) setModalOpen(false) }

  const submit = async (e) => {
    e.preventDefault()
    setFormError('')

    if (!form.full_name.trim()) return setFormError('Name is required.')
    if (!editing && !form.email.trim()) return setFormError('Email is required.')
    if (!editing && form.password.length < 6) return setFormError('Password must be at least 6 characters.')

    setSaving(true)
    try {
      if (editing) {
        const updated = await adminService.updateDoctor(editing.id, {
          fullName:  form.full_name,
          phone:     form.phone,
          specialty: form.specialty,
          status:    form.status,
          avatarFile,
          removeAvatar,
          currentAvatarUrl: editing.avatar_url,
        })
        setRows(prev => prev.map(r => r.id === editing.id ? { ...r, ...updated } : r))
        toast.success(`Dr. ${form.full_name.trim()} updated`)
      } else {
        const newRow = await adminService.createDoctor({
          email:     form.email,
          password:  form.password,
          fullName:  form.full_name,
          phone:     form.phone,
          specialty: form.specialty,
          status:    form.status,
          avatarFile,
        })
        // Refresh list to reflect new ordering / count
        await load()
        toast.success(`Doctor account created for Dr. ${newRow.full_name}`)
      }
      setModalOpen(false)
    } catch (err) {
      const msg = err.message ?? 'Save failed'
      setFormError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  /* ── Delete ── */
  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await adminService.deleteDoctor(deleteTarget.id, { currentAvatarUrl: deleteTarget.avatar_url })
      setRows(prev => prev.filter(r => r.id !== deleteTarget.id))
      setTotal(t => Math.max(0, t - 1))
      toast.success(`Dr. ${deleteTarget.full_name} deactivated`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err.message ?? 'Could not delete')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Doctor management
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-500 mt-1">
            Edit and manage doctor accounts. New doctors apply via the public site and are approved on the Doctor Approval page.
          </p>
        </div>
      </div>

      {/* Card with toolbar + table */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 border-b border-slate-200 dark:border-zinc-800 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, specialty…"
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

          <div className="flex items-center gap-2">
            {['all', 'active', 'inactive'].map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={
                  'px-3 h-9 rounded-full text-xs font-semibold capitalize transition border ' +
                  (status === s
                    ? 'bg-brand-700 text-white border-brand-700 dark:bg-white dark:text-black dark:border-white'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800 dark:hover:bg-zinc-800')
                }
              >
                {s}
              </button>
            ))}
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
          </div>

          <div className="sm:ml-auto text-xs text-slate-500 dark:text-zinc-500 whitespace-nowrap">
            {total} total
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-zinc-950">
                <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Doctor</th>
                <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500 hidden md:table-cell">Specialty</th>
                <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500 hidden lg:table-cell">Contact</th>
                <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Status</th>
                <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500 hidden md:table-cell">Joined</th>
                <th className="text-right px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Stethoscope}
                      title={search ? 'No doctors match your search' : 'No doctors yet'}
                      description={search ? 'Try a different search term.' : 'Approved doctor applications will appear here.'}
                    />
                  </td>
                </tr>
              ) : (
                rows.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-zinc-950 transition">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar src={d.avatar_url} name={d.full_name} size="md" />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white truncate">
                            Dr. {d.full_name ?? 'Unnamed'}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-zinc-500 truncate">
                            {d.email ?? d.id.slice(0, 8)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300 hidden md:table-cell">
                      {d.specialty ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300 hidden lg:table-cell">
                      {d.phone ? (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <Phone size={12} className="text-slate-400" /> {d.phone}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={d.status ?? 'active'} />
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-zinc-500 hidden md:table-cell">
                      {d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button variant="ghost" size="xs" onClick={() => openEdit(d)} title="Edit">
                          <Pencil size={13} />
                        </Button>
                        <Button variant="danger" size="xs" onClick={() => setDeleteTarget(d)} title="Delete">
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

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="px-5 py-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="text-xs text-slate-500 dark:text-zinc-500">
              Page {page} of {totalPages} — showing {rows.length} of {total}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add / Edit modal ── */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Edit Dr. ${editing.full_name}` : 'Add new doctor'}
        description={editing ? 'Update profile details and avatar.' : 'Create a new doctor account.'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancel</Button>
            <Button onClick={submit} loading={saving} type="submit">
              {editing ? 'Save changes' : 'Create doctor'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-1">
          {formError && (
            <div className="rounded-lg border-l-[3px] border-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-3 flex items-start gap-2.5 text-sm text-red-700 dark:text-red-400 mb-4">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
              Profile photo
            </label>
            <ImageUpload
              value={editing?.avatar_url}
              name={form.full_name}
              onFileSelected={(file) => {
                setAvatarFile(file)
                if (!file && editing?.avatar_url) setRemoveAvatar(true)
                else setRemoveAvatar(false)
              }}
              disabled={saving}
            />
          </div>

          <Field label="Full name" required>
            <Input
              value={form.full_name}
              onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="John Smith"
              disabled={saving}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email" required>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="doctor@example.com"
                disabled={saving || !!editing}
                readOnly={!!editing}
                className={editing ? 'opacity-60 cursor-not-allowed' : ''}
              />
              {editing && <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1.5">Email is fixed once created.</p>}
            </Field>

            {!editing ? (
              <Field label="Password" required hint={<><Mail size={11}/> Share securely with the doctor</>}>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Min. 6 characters"
                  minLength={6}
                  disabled={saving}
                />
              </Field>
            ) : (
              <Field label="Status">
                <Select
                  value={form.status}
                  onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                  disabled={saving}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </Select>
              </Field>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Phone">
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+961 70 000 000"
                disabled={saving}
              />
            </Field>
            <Field label="Specialty">
              <Input
                value={form.specialty}
                onChange={(e) => setForm(f => ({ ...f, specialty: e.target.value }))}
                placeholder="e.g. Pediatrics"
                disabled={saving}
              />
            </Field>
          </div>

          {!editing && (
            <p className="text-xs text-slate-500 dark:text-zinc-500 leading-relaxed mt-1">
              The new doctor will be auto-verified and can sign in immediately.
            </p>
          )}
        </form>
      </Modal>

      {/* ── Delete confirmation ── */}
      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        size="sm"
        title="Delete doctor?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
          <span className="font-semibold">Dr. {deleteTarget?.full_name}</span> will be deactivated and lose access immediately.
          Their auth login won't be permanently removed (that requires server-side admin access),
          but they will no longer be able to sign in.
        </p>
      </Modal>
    </>
  )
}
