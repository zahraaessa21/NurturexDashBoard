// src/components/Sidebar.jsx
//
// Sidebar nav. Shows role-specific items, theme toggle, and signed-in
// user footer with logout. Mobile: slides in from the left.

import { NavLink, useNavigate } from 'react-router-dom'
import {
  ClipboardList, LayoutDashboard, Stethoscope, Calendar, MessageSquare, User,
  Users, BarChart3, Building2, LogOut, X,
  Baby, Bell, Syringe, UserCheck,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { cn } from '../utils/cn'
import { doctorApplicationsAdminService } from '../services/doctorApplicationsAdminService'
import Logo from './Logo'
import Avatar from './ui/Avatar'

const ADMIN_NAV = [
  { to: '/admin',              icon: LayoutDashboard, label: 'Dashboard',    end: true },
  { to: '/admin/doctors',      icon: Stethoscope,     label: 'Doctors' },
  { to: '/admin/doctor-applications', icon: UserCheck, label: 'Doctor Approval' },
  { to: '/admin/infants',      icon: Baby,            label: 'Infants' },
  { to: '/admin/appointments', icon: Calendar,        label: 'Appointments' },
  { to: '/admin/reports',      icon: BarChart3,       label: 'Reports' },
  { to: '/admin/vaccine-schedule', icon: Syringe,     label: 'Vaccine Schedule' },
]

const DOCTOR_NAV = [
  { to: '/doctor',              icon: LayoutDashboard, label: 'Dashboard',     end: true },
  { to: '/doctor/infants',      icon: Baby,            label: 'Infants' },
  { to: '/doctor/appointments', icon: Calendar,        label: 'Appointments' },
  { to: '/doctor/messages',     icon: MessageSquare,   label: 'Messages' },
  { to: '/doctor/medical-notes', icon: ClipboardList,  label: 'Medical Notes' },
  { to: '/doctor/vaccinations', icon: Syringe,         label: 'Vaccinations' },
  { to: '/doctor/alerts',       icon: Bell,            label: 'Alerts' },
  { to: '/doctor/profile',      icon: User,            label: 'Profile' },
]

export default function Sidebar({ open, onClose }) {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    const load = () => {
      doctorApplicationsAdminService.countPending()
        .then((n) => { if (!cancelled) setPendingCount(n) })
        .catch(() => {})
    }
    load()
    const interval = setInterval(load, 60_000) // refresh every minute
    return () => { cancelled = true; clearInterval(interval) }
  }, [isAdmin])

  const items = isAdmin ? ADMIN_NAV : DOCTOR_NAV
  const role  = isAdmin ? 'Admin' : 'Doctor'

  const handleSignOut = async () => {
    try { await signOut(); navigate('/auth', { replace: true }) }
    catch (err) { toast.error(err.message ?? 'Could not sign out') }
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        className={cn(
          'lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      />

      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-screen w-64 flex flex-col',
          'bg-white dark:bg-zinc-950 border-r border-slate-200 dark:border-zinc-900',
          'transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand row */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-zinc-900 shrink-0">
          <Logo size={32} withWordmark wordmarkClass="text-base" />
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden text-slate-500 hover:text-slate-900 dark:hover:text-white"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Role chip */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-zinc-900">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-brand-50 text-brand-700 dark:bg-zinc-800 dark:text-zinc-200">
            {role} workspace
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
            Navigation
          </div>
          {items.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to} to={to} end={end} onClick={onClose}
              className={({ isActive }) => cn(
                'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition',
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-zinc-800/70 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-900'
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r bg-brand-600 dark:bg-white" />
                  )}
                  <Icon size={17} className="shrink-0 opacity-90 group-hover:opacity-100" />
                  <span className="flex-1">{label}</span>
                  {to === '/admin/doctor-applications' && pendingCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-red-500 text-white">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-zinc-900 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => { navigate(isAdmin ? '/admin/profile' : '/doctor/profile'); onClose?.() }}
            className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg -mx-1 px-1 py-1 hover:bg-slate-50 dark:hover:bg-zinc-900 transition"
          >
            <Avatar src={profile?.avatar_url} name={profile?.full_name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {profile?.full_name ?? 'User'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-500 capitalize truncate">
                {profile?.role}
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            title="Sign out"
            className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  )
}