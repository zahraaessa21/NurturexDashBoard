// src/services/directMessageService.js
//
// Real-time parent ↔ doctor messaging via direct_messages + conversations.
// Replaces the old messages-table messageService for the doctor dashboard.

import { supabase } from '../supabaseClient'

const CONV_SELECT = `id, user_id, doctor_id,
  user:user_id(id, full_name, email, phone, avatar_url),
  doctor:doctor_id(id, full_name, avatar_url)`

const MSG_SELECT = `id, conversation_id, sender_id, content, read_at, created_at,
  sender:sender_id(id, full_name, avatar_url)`

export const directMessageService = {

  // ── Conversations ─────────────────────────────────────────────────

  /** List all conversations this doctor is part of, newest-message first. */
  async listConversations({ doctorId, search = '' } = {}) {
    let q = supabase
      .from('conversations')
      .select(CONV_SELECT)
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false })

    const { data, error } = await q
    if (error) throw error

    // For each conversation, fetch last message + unread count
    const enriched = await Promise.all((data ?? []).map(async (conv) => {
      const [lastRes, unreadRes] = await Promise.all([
        supabase
          .from('direct_messages')
          .select('id, content, sender_id, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('direct_messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', doctorId)
          .is('read_at', null),
      ])
      return {
        ...conv,
        lastMessage: lastRes.data ?? null,
        unread:      unreadRes.count ?? 0,
      }
    }))

    // Filter by search
    let result = enriched
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      result = enriched.filter(c =>
        c.user?.full_name?.toLowerCase().includes(s) ||
        c.user?.email?.toLowerCase().includes(s)
      )
    }

    // Sort: conversations with unread first, then by lastMessage date
    result.sort((a, b) => {
      if (a.unread !== b.unread) return b.unread - a.unread
      const ta = a.lastMessage?.created_at ?? a.created_at
      const tb = b.lastMessage?.created_at ?? b.created_at
      return new Date(tb) - new Date(ta)
    })

    return result
  },

  /** Get or create a conversation between parent and doctor. */
  async getOrCreateConversation({ parentId, doctorId }) {
    // Check existing
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', parentId)
      .eq('doctor_id', doctorId)
      .maybeSingle()

    if (existing) return existing.id

    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: parentId, doctor_id: doctorId })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  },

  // ── Messages ──────────────────────────────────────────────────────

  /** Fetch all messages in a conversation (oldest first). */
  async listMessages(conversationId, { limit = 200 } = {}) {
    const { data, error } = await supabase
      .from('direct_messages')
      .select(MSG_SELECT)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit)
    if (error) throw error
    return data ?? []
  },

  /** Send a message. senderId must be the caller's auth.uid(). */
  async send({ conversationId, senderId, content }) {
    if (!content?.trim()) throw new Error('Message cannot be empty.')
    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ conversation_id: conversationId, sender_id: senderId, content: content.trim() })
      .select(MSG_SELECT)
      .single()
    if (error) throw error
    return data
  },

  /**
   * Upload a file to the chat-attachments bucket and send it as a message.
   * Content is encoded as "[[img]]<url>|<name>" or "[[file]]<url>|<name>"
   * so both the dashboard and the Flutter app render it consistently.
   *
   * @param {Object} o
   * @param {string} o.conversationId
   * @param {string} o.senderId
   * @param {File}   o.file              the File/Blob to upload
   * @param {'voice'|null} [o.kind]      force the marker (e.g. 'voice' for
   *                                     a recorded note) instead of relying
   *                                     on auto image/file detection
   * @param {(pct:number)=>void} [o.onProgress]  0..100 (best-effort)
   */
  async sendAttachment({ conversationId, senderId, file, kind, onProgress }) {
    if (!file) throw new Error('No file selected.')
    const isImage = (file.type || '').startsWith('image/')
    const isVoice = kind === 'voice'
    const safeName = (file.name || (isImage ? 'photo.jpg' : isVoice ? 'voice-message.webm' : 'file'))
      .replace(/[^\w.\-]+/g, '_')
    const path = `${conversationId}/${Date.now()}_${safeName}`

    // Best-effort progress: Supabase JS upload doesn't expose granular
    // progress, so we show indeterminate-style steps around the call.
    onProgress?.(10)
    const { error: upErr } = await supabase.storage
      .from('chat-attachments')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      })
    if (upErr) throw new Error(upErr.message || 'Upload failed.')
    onProgress?.(80)

    const { data: pub } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(path)
    const url = pub?.publicUrl
    if (!url) throw new Error('Could not get the file URL.')

    const marker = isVoice ? '[[voice]]' : isImage ? '[[img]]' : '[[file]]'
    const content = `${marker}${url}|${file.name || safeName}`

    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ conversation_id: conversationId, sender_id: senderId, content })
      .select(MSG_SELECT)
      .single()
    if (error) throw error
    onProgress?.(100)
    return data
  },

  /** Mark all messages from the other party as read. */
  async markRead({ conversationId, myId }) {
    const { error } = await supabase
      .from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', myId)
      .is('read_at', null)
    if (error) console.warn('markRead error (non-critical):', error.message)
    // Notify the notification hook to refresh its unread counts immediately,
    // without relying on realtime UPDATE replication being enabled.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nx:messages-read', {
        detail: { conversationId },
      }))
    }
  },

  /** Total unread across all conversations for a doctor. */
  async unreadCount({ doctorId }) {
    // Get all conversation IDs for this doctor
    const { data: convs } = await supabase
      .from('conversations')
      .select('id')
      .eq('doctor_id', doctorId)

    if (!convs?.length) return 0

    const convIds = convs.map(c => c.id)
    const { count, error } = await supabase
      .from('direct_messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', convIds)
      .neq('sender_id', doctorId)
      .is('read_at', null)

    if (error) return 0
    return count ?? 0
  },

  /** Delete a message (only own messages). */
  async remove(id) {
    const { error } = await supabase.from('direct_messages').delete().eq('id', id)
    if (error) throw error
  },

  // ── Realtime subscriptions ────────────────────────────────────────

  /**
   * Subscribe to new messages in a conversation.
   * Returns the subscription channel so the caller can call .unsubscribe().
   */
  subscribeToMessages({ conversationId, onInsert, onUpdate }) {
    return supabase
      .channel(`dm:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'direct_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            // Fetch full message with sender join
            const { data } = await supabase
              .from('direct_messages')
              .select(MSG_SELECT)
              .eq('id', payload.new.id)
              .maybeSingle()
            if (data) onInsert?.(data)
          } else if (payload.eventType === 'UPDATE') {
            onUpdate?.(payload.new)
          }
        }
      )
      .subscribe()
  },

  /**
   * Subscribe to new/updated conversations for a doctor.
   * Useful for refreshing the inbox unread count.
   */
  subscribeToConversations({ doctorId, onChange }) {
    return supabase
      .channel(`convs:${doctorId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'direct_messages',
        },
        () => onChange?.()
      )
      .subscribe()
  },
}