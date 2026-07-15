// src/components/Topbar.jsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Menu, Bell, Sun, Moon, ChevronDown,
  User, LogOut, Settings, MessageSquare, Calendar,
  Check, X, Clock,
} from 'lucide-react'
import { useAuth }          from '../hooks/useAuth'
import { useTheme }         from '../hooks/useTheme'
import { useToast }         from '../hooks/useToast'
import { useNotifications } from '../hooks/useNotifications'
import { cn }               from '../utils/cn'
import Avatar               from './ui/Avatar'
import { supabase }         from '../supabaseClient'
import { appointmentService } from '../services/appointmentService'
import { directMessageService } from '../services/directMessageService'

export default function Topbar({ title, onMenuClick }) {
  const { profile, isAdmin, signOut } = useAuth()
  const { isDark, toggle }  = useTheme()
  const navigate   = useNavigate()
  const toast      = useToast()
  const notif      = useNotifications()

  const [showProfile, setShowProfile] = useState(false)
  const [showNotif,   setShowNotif]   = useState(false)
  const [activeTab,   setActiveTab]   = useState('messages') // 'messages' | 'appointments'
  const profileRef = useRef(null)
  const notifRef   = useRef(null)

  useEffect(() => {
    if (!showProfile && !showNotif) return
    const onClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false)
      if (notifRef.current   && !notifRef.current.contains(e.target))   setShowNotif(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showProfile, showNotif])

  const root = isAdmin ? '/admin' : '/doctor'

  const handleSignOut = async () => {
    setShowProfile(false)
    try { await signOut(); navigate('/auth', { replace: true }) }
    catch (err) { toast.error(err.message ?? 'Could not sign out') }
  }

  const handleOpenAlert = (n) => {
    if (!n.is_read) notif.markAlertRead(n.id)

    // The structured "card" types carry an appointment_id — take the
    // doctor straight to that appointment instead of just marking read
    // and leaving them to go find it themselves. This is the actual
    // "wiring" that was missing: lab_results_submitted alerts fired
    // (Part 3) but nothing happened when you clicked one.
    const CARD_TYPES = ['lab_tests_requested', 'lab_results_ready', 'medications_prescribed', 'lab_results_submitted']
    const apptId = n.payload?.appointment_id
    if (CARD_TYPES.includes(n.type) && apptId) {
      setShowNotif(false)
      navigate(`${root}/appointments/${apptId}`)
    }
  }

  const handleAcceptAppt = async (appt) => {
    try {
      await appointmentService.updateStatus(appt.id, 'scheduled')
      toast.success('Appointment accepted')
      notif.refresh()
    } catch (e) { toast.error(e.message) }
  }

  const handleRejectAppt = async (appt) => {
    try {
      await appointmentService.updateStatus(appt.id, 'rejected')
      toast.success('Request rejected')
      notif.refresh()
    } catch (e) { toast.error(e.message) }
  }

  const handleOpenMessage = async (msg) => {
    setShowNotif(false)
    // Clear the unread mark locally right away.
    notif.dismissConversationMessages?.(msg.conversation_id)
    // Persist the read to the database so it doesn't reappear after refetch.
    if (msg.conversation_id && profile?.id) {
      directMessageService
        .markRead({ conversationId: msg.conversation_id, myId: profile.id })
        .catch(() => {})
    }
    // Open the exact conversation (messages page reads ?conv=<id>).
    if (msg.conversation_id) {
      navigate(`${root}/messages?conv=${msg.conversation_id}`)
    } else {
      navigate(`${root}/messages`)
    }
  }

  // Decode attachment markers so the preview reads cleanly instead of a URL.
  const msgPreview = (raw) => {
    const t = (raw ?? '').trim()
    if (!t) return 'New message'
    if (t.startsWith('[[img]]'))   return '📷 Photo'
    if (t.startsWith('[[voice]]')) return '🎤 Voice message'
    if (t.startsWith('[[file]]'))  return '📎 Attachment'
    return t
  }

  const fmtTime = (iso) => {
    const d = new Date(iso)
    const now = new Date()
    const diff = now - d
    if (diff < 60000)  return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${d.getDate()}/${d.getMonth() + 1}`
  }

  const fmtDate = (iso) => {
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
      ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <header className="sticky top-0 z-30 h-16 px-4 lg:px-6 flex items-center gap-3 bg-white/80 dark:bg-zinc-950/80 backdrop-blur border-b border-slate-200 dark:border-zinc-900">
      <button type="button" onClick={onMenuClick}
        className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-900"
        aria-label="Open menu">
        <Menu size={20} />
      </button>

      <h1 className="font-bold text-slate-900 dark:text-white tracking-tight truncate">{title}</h1>

      <div className="flex-1" />

      {/* Theme */}
      <button type="button" onClick={toggle}
        className="p-2 rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-900 transition"
        title="Toggle theme">
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* ── Notifications (doctor only — admin has no message/appointment inbox) ── */}
      {!isAdmin && (
      <div ref={notifRef} className="relative">
        <button type="button"
          onClick={() => { setShowNotif(v => !v); setShowProfile(false) }}
          className="relative p-2 rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-900 transition"
          aria-label="Notifications">
          <Bell size={18} />
          {notif.total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-0.5 rounded-full bg-red-500 border-2 border-white dark:border-zinc-950 text-[9px] font-bold text-white flex items-center justify-center">
              {notif.total > 99 ? '99+' : notif.total}
            </span>
          )}
        </button>

        {showNotif && (
          <div className="absolute right-0 mt-2 w-96 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden z-50">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-white">Notifications</span>
              <div className="flex items-center gap-2">
                {notif.total > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                    {notif.total} new
                  </span>
                )}
                <button onClick={() => setShowNotif(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800">
                  <X size={13} className="text-slate-400" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-zinc-800">
              <button onClick={() => setActiveTab('messages')}
                className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition',
                  activeTab === 'messages'
                    ? 'text-brand-600 dark:text-brand-400 border-b-2 border-brand-500'
                    : 'text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300')}>
                <MessageSquare size={13} />
                Messages
                {notif.unreadMessages > 0 && (
                  <span className="min-w-[16px] h-4 px-0.5 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 text-[9px] font-bold flex items-center justify-center">
                    {notif.unreadMessages}
                  </span>
                )}
              </button>
              <button onClick={() => setActiveTab('appointments')}
                className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition',
                  activeTab === 'appointments'
                    ? 'text-brand-600 dark:text-brand-400 border-b-2 border-brand-500'
                    : 'text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300')}>
                <Calendar size={13} />
                Appointments
                {notif.pendingAppointments > 0 && (
                  <span className="min-w-[16px] h-4 px-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[9px] font-bold flex items-center justify-center">
                    {notif.pendingAppointments}
                  </span>
                )}
              </button>
              <button onClick={() => setActiveTab('updates')}
                className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition',
                  activeTab === 'updates'
                    ? 'text-brand-600 dark:text-brand-400 border-b-2 border-brand-500'
                    : 'text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300')}>
                <Bell size={13} />
                Updates
                {notif.unreadAlerts > 0 && (
                  <span className="min-w-[16px] h-4 px-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[9px] font-bold flex items-center justify-center">
                    {notif.unreadAlerts}
                  </span>
                )}
              </button>
            </div>

            {/* Content */}
            <div className="max-h-80 overflow-y-auto">

              {/* Messages tab */}
              {activeTab === 'messages' && (
                notif.recentMessages.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400 dark:text-zinc-600">
                    <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
                    No unread messages
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {notif.recentMessages.map(msg => (
                      <li key={msg.id}>
                        <button onClick={() => handleOpenMessage(msg)}
                          className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800 text-left transition">
                          <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center flex-shrink-0">
                            {msg.sender?.avatar_url
                              ? <img src={msg.sender.avatar_url} className="w-8 h-8 rounded-full object-cover" />
                              : <span className="text-xs font-bold text-brand-700 dark:text-brand-300">
                                  {(msg.sender?.full_name ?? 'P')[0].toUpperCase()}
                                </span>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {msg.sender?.full_name ?? 'Parent'}
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-zinc-600 shrink-0 ml-2">
                                {fmtTime(msg.created_at)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                              {msgPreview(msg.content)}
                            </p>
                          </div>
                          <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {/* Appointments tab */}
              {activeTab === 'appointments' && (
                notif.recentAppointments.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400 dark:text-zinc-600">
                    <Calendar size={28} className="mx-auto mb-2 opacity-30" />
                    No pending appointments
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {notif.recentAppointments.map(appt => (
                      <li key={appt.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {appt.parent?.full_name ?? appt.infant?.name ?? 'Unknown'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-zinc-400">
                              <Clock size={10} />
                              {fmtDate(appt.scheduled_at)}
                              <span className="capitalize ml-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-zinc-800">
                                {appt.appt_type ?? 'checkup'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => handleAcceptAppt(appt)}
                              title="Confirm"
                              className="w-7 h-7 rounded-lg bg-green-50 dark:bg-green-500/10 hover:bg-green-500 text-green-600 hover:text-white dark:text-green-400 dark:hover:text-white flex items-center justify-center transition">
                              <Check size={13} />
                            </button>
                            <button onClick={() => handleRejectAppt(appt)}
                              title="Cancel"
                              className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white dark:text-red-400 dark:hover:text-white flex items-center justify-center transition">
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {/* Updates tab (notification_history: cancellations, alerts…) */}
              {activeTab === 'updates' && (
                notif.alerts.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400 dark:text-zinc-600">
                    <Bell size={28} className="mx-auto mb-2 opacity-30" />
                    No updates
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {notif.alerts.map(n => {
                      const needsAttention = n.type === 'lab_results_submitted' && !n.is_read
                      return (
                      <li key={n.id}
                        onClick={() => handleOpenAlert(n)}
                        className={cn('px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition',
                          !n.is_read && 'bg-brand-50/40 dark:bg-brand-500/5',
                          needsAttention && 'bg-amber-50/60 dark:bg-amber-500/10')}>
                        <div className="flex items-start gap-2">
                          {!n.is_read && <span className={cn('w-1.5 h-1.5 mt-1.5 rounded-full flex-shrink-0', needsAttention ? 'bg-amber-500' : 'bg-brand-500')} />}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <div className="text-xs font-bold text-slate-900 dark:text-white">{n.title}</div>
                              {needsAttention && (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                                  Needs review
                                </span>
                              )}
                            </div>
                            {n.body && <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">{n.body}</div>}
                            <div className="text-[10px] text-slate-400 dark:text-zinc-600 mt-1">{fmtDate(n.created_at)}</div>
                          </div>
                        </div>
                      </li>
                      )
                    })}
                  </ul>
                )
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-slate-100 dark:border-zinc-800 flex justify-between">
              <button
                onClick={() => { setShowNotif(false); navigate(`${root}/messages`) }}
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium">
                View all messages
              </button>
              <button
                onClick={() => { setShowNotif(false); navigate(`${root}/appointments`) }}
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium">
                View all appointments
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Profile */}
      <div ref={profileRef} className="relative">
        <button type="button"
          onClick={() => { setShowProfile(v => !v); setShowNotif(false) }}
          className="flex items-center gap-2 p-1 pl-1 pr-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-900 transition">
          <Avatar src={profile?.avatar_url} name={profile?.full_name} size="sm" />
          <ChevronDown size={13} className="text-slate-400" />
        </button>
        {showProfile && (
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lift overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
              <div className="text-sm font-semibold truncate">{profile?.full_name ?? 'User'}</div>
              <div className="text-xs text-slate-500 dark:text-zinc-500 capitalize">{profile?.role}</div>
            </div>
            <button type="button"
              onClick={() => { setShowProfile(false); navigate(`${root}/profile`) }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-zinc-800">
              <User size={15} /> My profile
            </button>
            <button type="button"
              onClick={() => { setShowProfile(false); toggle() }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-zinc-800">
              <Settings size={15} /> Toggle theme
            </button>
            <hr className="border-slate-200 dark:border-zinc-800" />
            <button type="button" onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}