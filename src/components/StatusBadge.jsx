// src/components/StatusBadge.jsx
import { cn } from '../utils/cn'

const STYLES = {
  active:       { dot: 'bg-emerald-500',  cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  verified:     { dot: 'bg-emerald-500',  cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  approved:     { dot: 'bg-emerald-500',  cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  completed:    { dot: 'bg-emerald-500',  cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  administered: { dot: 'bg-emerald-500',  cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  healthy:      { dot: 'bg-emerald-500',  cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  resolved:     { dot: 'bg-emerald-500',  cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  pending:      { dot: 'bg-amber-500',    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  monitoring:   { dot: 'bg-amber-500',    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  open:         { dot: 'bg-amber-500',    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  acknowledged: { dot: 'bg-blue-500',     cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  reviewed:     { dot: 'bg-blue-500',     cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  inactive:     { dot: 'bg-slate-400',    cls: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400' },
  archived:     { dot: 'bg-slate-400',    cls: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400' },
  discharged:   { dot: 'bg-slate-400',    cls: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400' },
  skipped:      { dot: 'bg-slate-400',    cls: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400' },
  rejected:     { dot: 'bg-red-500',      cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
  canceled:     { dot: 'bg-red-500',      cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
  suspended:    { dot: 'bg-red-500',      cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
  overdue:      { dot: 'bg-red-500',      cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
  critical:     { dot: 'bg-red-500',      cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
  at_risk:      { dot: 'bg-orange-500',   cls: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400' },
  doctor:       { dot: 'bg-brand-500',    cls: 'bg-brand-50 text-brand-700 dark:bg-zinc-800 dark:text-zinc-200' },
  admin:        { dot: 'bg-purple-500',   cls: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400' },
  scheduled:    { dot: 'bg-brand-500',    cls: 'bg-brand-50 text-brand-700 dark:bg-zinc-800 dark:text-zinc-200' },
  reschedule_proposed: { dot: 'bg-violet-500', cls: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400' },
}

export default function StatusBadge({ status, className }) {
  const key = String(status ?? '').toLowerCase()
  const def = STYLES[key] ?? STYLES.inactive
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap',
      def.cls,
      className
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', def.dot)} />
      <span className="capitalize">{String(status ?? '').replace(/_/g, ' ')}</span>
    </span>
  )
}
