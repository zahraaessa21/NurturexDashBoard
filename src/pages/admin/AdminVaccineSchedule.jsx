// src/pages/admin/AdminVaccineSchedule.jsx
//
// Admin-managed master vaccine schedule — the dataset that automatically
// decides which vaccines are due for every infant, at what age. Editing
// this affects newly registered infants going forward (existing infants
// already had their schedule generated at birth and aren't touched).

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, Syringe, RefreshCw, AlertCircle, Search } from 'lucide-react'
import { useToast } from '../../hooks/useToast'
import { vaccineScheduleService } from '../../services/vaccineScheduleService'

import EmptyState  from '../../components/EmptyState'
import Button       from '../../components/ui/Button'
import Modal        from '../../components/ui/Modal'
import { Field, Input, Textarea } from '../../components/ui/Field'
import { SkeletonRow } from '../../components/ui/Skeleton'

function ageLabel(months) {
  const n = Number(months)
  if (n === 0) return 'At birth'
  if (n < 1) return `${Math.round(n * 4.345)} weeks`
  if (n < 12) return `${n} month${n === 1 ? '' : 's'}`
  const years = Math.floor(n / 12)
  const rem = n % 12
  return rem === 0 ? `${years} year${years === 1 ? '' : 's'}` : `${years}y ${rem}m`
}

const EMPTY_FORM = { vaccine_name: '', dose_number: 1, recommended_age_months: 0, description: '', sort_order: 0 }

export default function AdminVaccineSchedule() {
  const toast = useToast()

  const [rows,    setRows]    = useState([])
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(true)

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
      setRows(await vaccineScheduleService.list())
    } catch (err) {
      toast.error(err.message ?? 'Could not load vaccine schedule')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(v =>
      v.vaccine_name?.toLowerCase().includes(q) ||
      v.description?.toLowerCase().includes(q)
    )
  }, [rows, search])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, sort_order: rows.length })
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setForm({
      vaccine_name: row.vaccine_name,
      dose_number: row.dose_number,
      recommended_age_months: row.recommended_age_months,
      description: row.description ?? '',
      sort_order: row.sort_order,
    })
    setFormError('')
    setModalOpen(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      if (editing) {
        await vaccineScheduleService.update(editing.id, form)
        toast.success('Vaccine updated')
      } else {
        await vaccineScheduleService.create(form)
        toast.success('Vaccine added to schedule')
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
      await vaccineScheduleService.remove(deleteTarget.id)
      setRows(prev => prev.filter(r => r.id !== deleteTarget.id))
      toast.success('Removed from schedule')
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err.message ?? 'Could not delete')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Vaccine Schedule
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-500 mt-1 max-w-2xl">
            The master dataset that automatically decides which vaccines are due for every infant, and when.
            Changes here apply to newly registered infants going forward — infants already in the system keep
            the schedule they were given at birth.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> Refresh</Button>
          <Button onClick={openCreate}><Plus size={14} /> Add vaccine</Button>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vaccine name…"
              className="block w-full h-9 pl-9 pr-3 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500"
            />
          </div>
          <span className="ml-auto text-xs text-slate-500 dark:text-zinc-500">{filteredRows.length} of {rows.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-zinc-500 border-b border-slate-200 dark:border-zinc-800">
                <th className="px-5 py-3 font-medium">Vaccine</th>
                <th className="px-5 py-3 font-medium">Dose</th>
                <th className="px-5 py-3 font-medium">Due at</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Description</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={5}>
                  <EmptyState icon={Syringe} title={search ? 'No vaccines match' : 'No vaccines in the schedule'} description={search ? 'Try a different search.' : "Click 'Add vaccine' to start building it."} />
                </td></tr>
              ) : (
                filteredRows.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">{v.vaccine_name}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300">Dose {v.dose_number}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300">{ageLabel(v.recommended_age_months)}</td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-zinc-400 hidden md:table-cell max-w-xs truncate">{v.description ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button variant="ghost" size="xs" onClick={() => openEdit(v)}><Pencil size={13} /></Button>
                        <Button variant="danger" size="xs" onClick={() => setDeleteTarget(v)}><Trash2 size={13} /></Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? `Edit ${editing.vaccine_name}` : 'Add vaccine to schedule'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} loading={saving}>{editing ? 'Save changes' : 'Add vaccine'}</Button>
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
          <Field label="Vaccine name" required>
            <Input value={form.vaccine_name} onChange={(e) => setForm(f => ({ ...f, vaccine_name: e.target.value }))} placeholder="e.g. DTaP" disabled={saving} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dose number" required>
              <Input type="number" min={1} value={form.dose_number} onChange={(e) => setForm(f => ({ ...f, dose_number: e.target.value }))} disabled={saving} />
            </Field>
            <Field label="Due at (months)" required hint="0 = at birth. 1.5 = 6 weeks.">
              <Input type="number" min={0} step={0.5} value={form.recommended_age_months} onChange={(e) => setForm(f => ({ ...f, recommended_age_months: e.target.value }))} disabled={saving} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="What this dose protects against, or notes for staff." disabled={saving} />
          </Field>
          <Field label="Sort order" hint="Controls display order — lower shows first.">
            <Input type="number" value={form.sort_order} onChange={(e) => setForm(f => ({ ...f, sort_order: e.target.value }))} disabled={saving} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        size="sm"
        title="Remove from schedule?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>Remove</Button>
          </>
        }
      >
        <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
          Removing <span className="font-semibold">{deleteTarget?.vaccine_name} (Dose {deleteTarget?.dose_number})</span> only
          affects infants registered from now on — it won't remove this vaccine from records of infants who already have it scheduled.
        </p>
      </Modal>
    </>
  )
}
