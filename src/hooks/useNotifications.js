// src/hooks/useNotifications.js
//
// Real-time notification counts for the Topbar.
// Tracks:
//   - Unread direct messages (parent → doctor)
//   - Pending appointment requests (status = 'scheduled')

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './useAuth'

export function useNotifications() {
  const { user, isAdmin } = useAuth()

  const [unreadMessages,      setUnreadMessages]      = useState(0)
  const [pendingAppointments, setPendingAppointments] = useState(0)
  const [recentMessages,      setRecentMessages]      = useState([])
  const [recentAppointments,  setRecentAppointments]  = useState([])
  const [alerts,              setAlerts]              = useState([])
  const [unreadAlerts,        setUnreadAlerts]        = useState(0)
  const [loading,             setLoading]             = useState(true)

  const total = unreadMessages + pendingAppointments + unreadAlerts

  // ── Fetch unread messages ────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!user?.id) return
    try {
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .eq('doctor_id', user.id)

      if (!convs?.length) {
        setUnreadMessages(0)
        setRecentMessages([])
        return
      }
      const convIds = convs.map(c => c.id)

      const { count } = await supabase
        .from('direct_messages')
        .select('*', { count: 'exact', head: true })
        .in('conversation_id', convIds)
        .neq('sender_id', user.id)
        .is('read_at', null)

      setUnreadMessages(count ?? 0)

      const { data: msgs } = await supabase
        .from('direct_messages')
        .select('id, content, created_at, conversation_id, sender:sender_id(id, full_name, avatar_url)')
        .in('conversation_id', convIds)
        .neq('sender_id', user.id)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(5)

      setRecentMessages(msgs ?? [])
    } catch (e) {
      console.error('[useNotifications] fetchMessages:', e)
    }
  }, [user?.id])

  // ── Fetch pending appointments ───────────────────────────────────
  const fetchAppointments = useCallback(async () => {
    if (!user?.id) return
    try {
      let q = supabase
        .from('appointments')
        .select('id, scheduled_at, appt_type, parent:parent_id(id, full_name), infant:infant_id(id, name)',
                { count: 'exact' })
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true })
        .limit(5)

      if (!isAdmin) q = q.eq('doctor_id', user.id)

      const { data, count } = await q
      setPendingAppointments(count ?? 0)
      setRecentAppointments(data ?? [])
    } catch (e) {
      console.error('[useNotifications] fetchAppointments:', e)
    }
  }, [user?.id, isAdmin])

  // ── Fetch notification_history (alerts, cancellations, etc.) ──────
  const fetchAlerts = useCallback(async () => {
    if (!user?.id) return
    try {
      const { data } = await supabase
        .from('notification_history')
        .select('id, type, title, body, payload, is_read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(15)
      // Updates should NOT contain chat messages — those live in the
      // Messages tab only. Filter out any message-type rows so they don't
      // appear in both places.
      const MESSAGE_TYPES = ['message', 'new_message', 'chat', 'direct_message']
      const nonMessage = (data ?? []).filter(
        n => !MESSAGE_TYPES.includes((n.type ?? '').toLowerCase())
      )
      setAlerts(nonMessage)
      setUnreadAlerts(nonMessage.filter(n => !n.is_read).length)
    } catch (e) {
      console.error('[useNotifications] fetchAlerts:', e)
    }
  }, [user?.id])

  // Mark a notification_history row as read.
  const markAlertRead = useCallback(async (id) => {
    try {
      await supabase.from('notification_history').update({ is_read: true }).eq('id', id)
      setAlerts(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setUnreadAlerts(prev => Math.max(0, prev - 1))
    } catch (e) {
      console.error('[useNotifications] markAlertRead:', e)
    }
  }, [])

  // Optimistically clear a conversation's messages from the notification
  // box (called when the user clicks a message notification / opens the chat).
  const dismissConversationMessages = useCallback((conversationId) => {
    if (!conversationId) return
    setRecentMessages(prev => {
      const removed = prev.filter(m => m.conversation_id === conversationId).length
      if (removed > 0) {
        setUnreadMessages(c => Math.max(0, c - removed))
      }
      return prev.filter(m => m.conversation_id !== conversationId)
    })
  }, [])

  // ── Combined load ────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true)
    await Promise.allSettled([fetchMessages(), fetchAppointments(), fetchAlerts()])
    setLoading(false)
  }, [fetchMessages, fetchAppointments, fetchAlerts])

  useEffect(() => { refresh() }, [refresh])

  // ── Real-time subscriptions ──────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return

    const msgChannel = supabase
      .channel(`notif-msg-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' },
          () => fetchMessages())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages' },
          () => fetchMessages())
      .subscribe()

    const apptChannel = supabase
      .channel(`notif-appt-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' },
          () => fetchAppointments())
      .subscribe()

    const alertChannel = supabase
      .channel(`notif-hist-${user.id}`)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notification_history', filter: `user_id=eq.${user.id}` },
          () => fetchAlerts())
      .subscribe()

    // When a conversation is opened/read anywhere in the app, clear its
    // unread mark immediately, then re-fetch the authoritative count.
    const onMessagesRead = (e) => {
      const convId = e?.detail?.conversationId
      if (convId) dismissConversationMessages(convId)
      fetchMessages()
    }
    window.addEventListener('nx:messages-read', onMessagesRead)

    return () => {
      supabase.removeChannel(msgChannel)
      supabase.removeChannel(apptChannel)
      supabase.removeChannel(alertChannel)
      window.removeEventListener('nx:messages-read', onMessagesRead)
    }
  }, [user?.id, fetchMessages, fetchAppointments, fetchAlerts, dismissConversationMessages])

  return {
    total,
    unreadMessages,
    pendingAppointments,
    unreadAlerts,
    recentMessages,
    recentAppointments,
    alerts,
    markAlertRead,
    dismissConversationMessages,
    loading,
    refresh,
  }
}