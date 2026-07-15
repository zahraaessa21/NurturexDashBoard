// src/pages/admin/AdminDoctorApplications.jsx
//
// "Doctor Approval" — review pending doctor applications, view uploaded
// CV/license, and approve (creates account + emails credentials) or
// reject (emails the applicant) via the send-doctor-decision-email
// Edge Function.

import { useEffect, useState, useCallback } from 'react'
import { FileText, ShieldCheck, Check, X, RefreshCw, ExternalLink, AlertCircle, Search } from 'lucide-react'
import { doctorApplicationsAdminService } from '../../services/doctorApplicationsAdminService'
import { useToast } from '../../hooks/useToast'

import EmptyState  from '../../components/EmptyState'
import StatusBadge from '../../components/StatusBadge'
import Modal        from '../../components/ui/Modal'
import Button        from '../../components/ui/Button'
import { Field, Textarea } from '../../components/ui/Field'
import { SkeletonRow } from '../../components/ui/Skeleton'

const PAGE_SIZE = 10
const TABS = ['pending', 'approved', 'rejected', 'all']

export default function AdminDoctorApplications() {
  const toast = useToast()

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState('pending')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const [docLoading, setDocLoading] = useState(null) // application id + doc type currently loading

  const [approveTarget, setApproveTarget] = useState(null)
  const [approving, setApproving] = useState(false)

  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { rows, total } = await doctorApplicationsAdminService.list({ status: tab, search, page, pageSize: PAGE_SIZE })
      setRows(rows); setTotal(total)
    } catch (err) {
      toast.error(err.message ?? 'Could not load applications')
    } finally {
      setLoading(false)
    }
  }, [tab, search, page, toast])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [tab, search])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const viewDoc = async (app, field) => {
    setDocLoading(app.id + field)
    try {
      const url = await doctorApplicationsAdminService.getDocUrl(app[field])
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(err.message ?? 'Could not open document')
    } finally {
      setDocLoading(null)
    }
  }

  const confirmApprove = async () => {
    if (!approveTarget) return
    setApproving(true)
    try {
      await doctorApplicationsAdminService.approve(approveTarget)
      toast.success(`Dr. ${approveTarget.full_name} approved — credentials emailed.`)
      setApproveTarget(null)
      await load()
    } catch (err) {
      toast.error(err.message ?? 'Approval failed')
    } finally {
      setApproving(false)
    }
  }

  const confirmReject = async () => {
    if (!rejectTarget) return
    setRejecting(true)
    try {
      await doctorApplicationsAdminService.reject(rejectTarget, rejectReason.trim())
      toast.success(`Application from ${rejectTarget.full_name} rejected.`)
      setRejectTarget(null)
      setRejectReason('')
      await load()
    } catch (err) {
      toast.error(err.message ?? 'Rejection failed')
    } finally {
      setRejecting(false)
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Doctor Approval
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-500 mt-1">
            Review applications, verify documents, and approve or reject.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-wrap items-center gap-3 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  'px-3 h-9 rounded-full text-xs font-semibold capitalize transition border ' +
                  (tab === t
                    ? 'bg-brand-700 text-white border-brand-700 dark:bg-white dark:text-black dark:border-white'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800 dark:hover:bg-zinc-800')
                }
              >
                {t}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[180px] max-w-xs sm:ml-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email…"
              className="block w-full h-9 pl-9 pr-3 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-zinc-500 border-b border-slate-200 dark:border-zinc-800">
                <th className="px-5 py-3 font-medium">Doctor</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Phone</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Specialty</th>
                <th className="px-5 py-3 font-medium">Documents</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Applied</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
              ) : rows.length === 0 ? (
                <tr><td colSpan={7}><EmptyState icon={ShieldCheck} title="No applications" description="Nothing to review here yet." /></td></tr>
              ) : (
                rows.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900 dark:text-white">Dr. {a.full_name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-500 truncate max-w-[220px]">{a.email}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300 hidden md:table-cell">{a.phone ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-300 hidden lg:table-cell">
                      <span className="capitalize">{a.specialty ?? '—'}</span>
                      {a.clinic_name && (
                        <div className="text-[11px] text-slate-400 dark:text-zinc-500 truncate max-w-[160px]">{a.clinic_name}</div>
                      )}
                      {Array.isArray(a.working_hours) && a.working_hours.length > 0 && (
                        <div className="text-[11px] text-slate-400 dark:text-zinc-500">
                          {a.working_hours[0].start}–{a.working_hours[0].end} · {a.working_hours.length}d/wk
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="xs" loading={docLoading === a.id + 'cv_path'} onClick={() => viewDoc(a, 'cv_path')}>
                          <FileText size={12} /> CV
                        </Button>
                        <Button variant="outline" size="xs" loading={docLoading === a.id + 'license_path'} onClick={() => viewDoc(a, 'license_path')}>
                          <ShieldCheck size={12} /> License
                        </Button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-zinc-500 hidden md:table-cell">
                      {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3.5"><StatusBadge status={a.status} /></td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        {a.status === 'pending' ? (
                          <>
                            <Button variant="primary" size="xs" onClick={() => setApproveTarget(a)}>
                              <Check size={13} /> Approve
                            </Button>
                            <Button variant="danger" size="xs" onClick={() => { setRejectTarget(a); setRejectReason('') }}>
                              <X size={13} /> Reject
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {a.reviewed_at ? new Date(a.reviewed_at).toLocaleDateString() : ''}
                          </span>
                        )}
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

      {/* Approve confirmation */}
      <Modal
        open={!!approveTarget}
        onClose={() => !approving && setApproveTarget(null)}
        size="sm"
        title="Approve application?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setApproveTarget(null)} disabled={approving}>Cancel</Button>
            <Button onClick={confirmApprove} loading={approving}>Approve & Send Credentials</Button>
          </>
        }
      >
        <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
          This creates a live doctor account for <span className="font-semibold">Dr. {approveTarget?.full_name}</span> and
          emails a temporary password to <span className="font-semibold">{approveTarget?.email}</span>.
        </p>
      </Modal>

      {/* Reject with reason */}
      <Modal
        open={!!rejectTarget}
        onClose={() => !rejecting && setRejectTarget(null)}
        size="sm"
        title="Reject application?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)} disabled={rejecting}>Cancel</Button>
            <Button variant="danger" onClick={confirmReject} loading={rejecting}>Reject & Notify</Button>
          </>
        }
      >
        <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed mb-3">
          <span className="font-semibold">{rejectTarget?.full_name}</span> will receive a rejection email.
          You can optionally include a reason.
        </p>
        <Field label="Reason (optional)">
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. License could not be verified" rows={3} />
        </Field>
      </Modal>
    </>
  )
}
