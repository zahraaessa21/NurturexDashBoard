// src/pages/doctor/DoctorMessages.jsx
//
// Real-time doctor ↔ parent messaging using direct_messages + conversations.
// Two-pane layout: inbox (left) + open conversation (right).
// Supabase Realtime updates messages and unread counts instantly.

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Search, Send, MessageSquare, ArrowLeft, CheckCheck, Check,
  RefreshCw, Inbox, AlertCircle, Trash2, Users, History,
  Paperclip, Camera, Download, FileText, X, Mic, Square, Trash,
} from 'lucide-react'

import { useAuth }  from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { directMessageService } from '../../services/directMessageService'
import { infantService } from '../../services/infantService'

import EmptyState from '../../components/EmptyState'
import Avatar     from '../../components/ui/Avatar'
import Button     from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { cn } from '../../utils/cn'

// Short preview string for the inbox list.
function previewText(content) {
  const t = (content ?? '').trim()
  if (t.startsWith('[[img]]'))   return '📷 Photo'
  if (t.startsWith('[[voice]]')) return '🎤 Voice message'
  if (t.startsWith('[[file]]')) {
    const m = /\|(.*)$/s.exec(t)
    return `📎 ${m ? m[1] : 'Attachment'}`
  }
  return t
}

// Renders message content: decodes "[[img]]url|name" and "[[file]]url|name"
// into an inline image or a downloadable file card. Plain text passes through.
function MessageContent({ content, isMe }) {
  const m = /^\[\[(img|file|voice)\]\](.*?)\|(.*)$/s.exec(content ?? '')
  if (!m) {
    return <div className="whitespace-pre-wrap break-words">{content}</div>
  }
  const kind = m[1]
  const url  = m[2]
  const name = m[3] || 'attachment'

  if (kind === 'img') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={url}
          alt={name}
          className="rounded-lg max-w-[220px] max-h-[260px] object-cover"
          loading="lazy"
        />
      </a>
    )
  }

  if (kind === 'voice') {
    return <audio controls src={url} className="max-w-[220px]" />
  }

  // file card
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={name}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 min-w-[180px] max-w-[240px] transition',
        isMe ? 'bg-white/15 hover:bg-white/25' : 'bg-slate-100 dark:bg-zinc-700 hover:bg-slate-200 dark:hover:bg-zinc-600',
      )}
    >
      <span className={cn('w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0',
        isMe ? 'bg-white/20' : 'bg-white dark:bg-zinc-800')}>
        <FileText size={16} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate text-xs font-semibold">{name}</span>
        <span className="block text-[10px] opacity-70">Tap to download</span>
      </span>
      <Download size={14} className="flex-shrink-0 opacity-80" />
    </a>
  )
}

export default function DoctorMessages() {
  const { user } = useAuth()
  const toast    = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── State ────────────────────────────────────────────────────────
  const [conversations,    setConversations]    = useState([])
  const [search,           setSearch]           = useState('')
  const [loadingConvs,     setLoadingConvs]     = useState(true)
  const [infantByParent,   setInfantByParent]   = useState({}) // parent_id -> infant

  const activeConvId = searchParams.get('conv') || null
  const [activeConv,       setActiveConv]       = useState(null)
  const [messages,         setMessages]         = useState([])
  const [loadingMsgs,      setLoadingMsgs]      = useState(false)
  const [draft,            setDraft]            = useState('')
  const [sending,          setSending]          = useState(false)
  const [uploadPct,        setUploadPct]        = useState(0)   // 0 = idle
  const [cameraOpen,       setCameraOpen]       = useState(false)
  const [recording,        setRecording]        = useState(false)
  const [recordSecs,       setRecordSecs]       = useState(0)

  const messagesEndRef = useRef(null)
  const realtimeRef    = useRef(null)    // current message subscription
  const convsRealtimeRef = useRef(null)  // conversation subscription
  const fileInputRef   = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef   = useRef([])
  const recordTimerRef   = useRef(null)

  // ── Load conversation list ───────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!user?.id) return
    setLoadingConvs(true)
    try {
      const data = await directMessageService.listConversations({
        doctorId: user.id,
        search,
      })
      setConversations(data)
    } catch (err) {
      toast.error(err.message ?? 'Could not load conversations')
    } finally {
      setLoadingConvs(false)
    }
  }, [user, search, toast])

  useEffect(() => { loadConversations() }, [loadConversations])

  // One-time lookup so the "History" button next to each conversation
  // knows which infant to open — maps parent_id -> their (first) infant.
  useEffect(() => {
    if (!user?.id) return
    infantService.list({ doctorId: user.id, pageSize: 1000 })
      .then(({ rows }) => {
        const map = {}
        for (const inf of rows) {
          if (inf.parent?.id && !map[inf.parent.id]) map[inf.parent.id] = inf
        }
        setInfantByParent(map)
      })
      .catch(() => {})
  }, [user])

  // ── Subscribe to new messages for inbox refresh ──────────────────
  useEffect(() => {
    if (!user?.id) return
    const ch = directMessageService.subscribeToConversations({
      doctorId: user.id,
      onChange: loadConversations,
    })
    convsRealtimeRef.current = ch
    return () => { ch.unsubscribe() }
  }, [user, loadConversations])

  // ── Open conversation ────────────────────────────────────────────
  useEffect(() => {
    if (!activeConvId) {
      setMessages([])
      setActiveConv(null)
      return
    }
    // Find conv from list (or refetch if needed)
    const conv = conversations.find(c => c.id === activeConvId)
    if (conv) setActiveConv(conv)

    // Cleanup previous realtime sub
    if (realtimeRef.current) realtimeRef.current.unsubscribe()

    let cancelled = false
    setLoadingMsgs(true)
    ;(async () => {
      try {
        const msgs = await directMessageService.listMessages(activeConvId)
        if (cancelled) return
        setMessages(msgs)

        // Mark as read — clear the inbox badge instantly.
        setConversations(prev =>
          prev.map(c => c.id === activeConvId ? { ...c, unread: 0 } : c))
        await directMessageService.markRead({ conversationId: activeConvId, myId: user.id })
        // Re-sync only if markRead truly cleared them server-side. If RLS
        // blocked it, listConversations would re-report the old count and
        // overwrite our optimistic 0, so we keep the local 0 and let the
        // next natural refresh reconcile. (Run FIX_markread_rls.sql so the
        // server-side update actually succeeds.)
      } catch (err) {
        if (!cancelled) toast.error(err.message ?? 'Could not load messages')
      } finally {
        if (!cancelled) setLoadingMsgs(false)
      }

      // Subscribe to realtime updates for this conversation
      if (cancelled) return
      const ch = directMessageService.subscribeToMessages({
        conversationId: activeConvId,
        onInsert: (msg) => {
          setMessages(prev => {
            // Avoid duplicates (optimistic insert + realtime)
            if (prev.some(m => m.id === msg.id)) return prev
            return [...prev, msg]
          })
          // Mark as read if it's from the other party
          if (msg.sender_id !== user.id) {
            directMessageService.markRead({ conversationId: activeConvId, myId: user.id })
              .then(loadConversations)
          }
        },
        onUpdate: (updated) => {
          setMessages(prev => prev.map(m =>
            m.id === updated.id ? { ...m, read_at: updated.read_at } : m
          ))
        },
      })
      realtimeRef.current = ch
    })()

    return () => {
      cancelled = true
      if (realtimeRef.current) realtimeRef.current.unsubscribe()
    }
  }, [activeConvId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll ──────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  // ── Send ─────────────────────────────────────────────────────────
  const sendMessage = async (e) => {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || !activeConvId || sending) return
    setSending(true)

    // Optimistic insert
    const optimistic = {
      id:              `opt_${Date.now()}`,
      conversation_id: activeConvId,
      sender_id:       user.id,
      content:         text,
      read_at:         null,
      created_at:      new Date().toISOString(),
      sender:          { id: user.id, full_name: user.email },
    }
    setMessages(prev => [...prev, optimistic])
    setDraft('')

    try {
      const saved = await directMessageService.send({
        conversationId: activeConvId,
        senderId:       user.id,
        content:        text,
      })
      // Replace optimistic with real
      setMessages(prev => prev.map(m =>
        m.id === optimistic.id ? saved : m
      ))
      loadConversations()
    } catch (err) {
      // Rollback
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setDraft(text)
      toast.error(err.message ?? 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  // ── Send an attachment (file picker, camera, or voice recording) ──
  const MAX_BYTES = 25 * 1024 * 1024 // 25 MB
  const sendFile = async (file, kind = null) => {
    if (!file || !activeConvId || sending) return
    if (file.size > MAX_BYTES) {
      toast.error('File is too large (max 25 MB).')
      return
    }
    setSending(true)
    setUploadPct(5)
    try {
      const saved = await directMessageService.sendAttachment({
        conversationId: activeConvId,
        senderId:       user.id,
        file,
        kind,
        onProgress:     (p) => setUploadPct(p),
      })
      setMessages(prev => [...prev, saved])
      loadConversations()
    } catch (err) {
      toast.error(err.message ?? 'Could not send attachment')
    } finally {
      setSending(false)
      setUploadPct(0)
    }
  }

  // ── Voice recording (native MediaRecorder — no extra dependency) ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '')
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      setRecordSecs(0)
      recordTimerRef.current = setInterval(() => setRecordSecs((s) => s + 1), 1000)
    } catch {
      toast.error('Microphone access was denied or is unavailable.')
    }
  }

  const stopRecordingTracks = () => {
    mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop())
    clearInterval(recordTimerRef.current)
    setRecording(false)
    setRecordSecs(0)
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null
      mediaRecorderRef.current.stop()
    }
    stopRecordingTracks()
    audioChunksRef.current = []
  }

  const finishRecording = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    recorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      audioChunksRef.current = []
      const ext = (recorder.mimeType || '').includes('mp4') ? 'm4a' : 'webm'
      const file = new File([blob], `voice-message.${ext}`, { type: blob.type })
      sendFile(file, 'voice')
    }
    recorder.stop()
    stopRecordingTracks()
  }

  useEffect(() => () => clearInterval(recordTimerRef.current), [])

  const fmtRecordTime = (s) => `${String(Math.floor(s / 60)).padStart(1, '0')}:${String(s % 60).padStart(2, '0')}`

  const onPickFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking same file
    if (file) sendFile(file)
  }

  const deleteMessage = async (id) => {
    if (!confirm('Delete this message?')) return
    try {
      await directMessageService.remove(id)
      setMessages(prev => prev.filter(m => m.id !== id))
    } catch (err) {
      toast.error(err.message ?? 'Could not delete')
    }
  }

  const openConv    = (id) => setSearchParams({ conv: id })
  const closeConv   = () => {
    const sp = new URLSearchParams(searchParams)
    sp.delete('conv')
    setSearchParams(sp)
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Messages
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-500 mt-1">
            Real-time conversations with parents — powered by Supabase Realtime.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadConversations} disabled={loadingConvs}>
          <RefreshCw size={13} className={loadingConvs ? 'animate-spin' : ''} />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-13rem)] min-h-[500px]">

        {/* ── Inbox ── */}
        <aside className={cn(
          'rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col',
          activeConvId && 'hidden lg:flex',
        )}>
          <div className="p-3 border-b border-slate-200 dark:border-zinc-800">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="block w-full h-10 pl-9 pr-3 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 outline-none text-slate-900 dark:text-white"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="p-3 space-y-2">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : conversations.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No conversations yet"
                description="Parents will appear here once they message you from the mobile app."
              />
            ) : (
              <ul>
                {conversations.map(conv => {
                  const isActive  = activeConvId === conv.id
                  const parent    = conv.user
                  const lastMsg   = conv.lastMessage
                  const isMyMsg   = lastMsg?.sender_id === user?.id
                  const infant    = parent?.id ? infantByParent[parent.id] : null
                  return (
                    <li key={conv.id} className="group relative">
                      <button
                        onClick={() => openConv(conv.id)}
                        className={cn(
                          'w-full text-left px-3 py-2.5 flex items-start gap-3 border-l-2 transition',
                          isActive
                            ? 'bg-brand-50 dark:bg-zinc-800 border-brand-700 dark:border-white'
                            : 'border-transparent hover:bg-slate-50 dark:hover:bg-zinc-950',
                        )}
                      >
                        <div className="relative shrink-0">
                          <Avatar name={parent?.full_name || parent?.email} size="md" />
                          {conv.unread > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold bg-brand-700 text-white dark:bg-white dark:text-black grid place-items-center">
                              {conv.unread}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'font-semibold text-sm truncate flex-1',
                              conv.unread > 0
                                ? 'text-slate-900 dark:text-white'
                                : 'text-slate-600 dark:text-zinc-400',
                            )}>
                              {parent?.full_name || parent?.email || 'Parent'}
                            </span>
                            {lastMsg && (
                              <span className="text-[10px] text-slate-400 dark:text-zinc-500 shrink-0">
                                {timeAgo(lastMsg.created_at)}
                              </span>
                            )}
                          </div>
                          {lastMsg && (
                            <div className="flex items-center gap-1 mt-0.5">
                              {isMyMsg && (
                                lastMsg.read_at
                                  ? <CheckCheck size={11} className="text-brand-500 shrink-0" />
                                  : <Check size={11} className="text-slate-400 shrink-0" />
                              )}
                              <p className={cn(
                                'text-xs truncate',
                                conv.unread > 0
                                  ? 'text-slate-700 dark:text-zinc-300 font-semibold'
                                  : 'text-slate-400 dark:text-zinc-500',
                              )}>
                                {isMyMsg ? 'You: ' : ''}{previewText(lastMsg.content)}
                              </p>
                            </div>
                          )}
                        </div>
                      </button>

                      {infant && (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/doctor/infants/${infant.id}`) }}
                          title={`${infant.name}'s record`}
                          className="absolute right-2.5 top-2.5 p-1.5 rounded-lg bg-white dark:bg-zinc-900 text-slate-400 hover:text-brand-700 dark:hover:text-white opacity-0 group-hover:opacity-100 shadow-sm border border-slate-200 dark:border-zinc-800 transition"
                        >
                          <History size={13} />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* ── Conversation ── */}
        <section className={cn(
          'rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col',
          !activeConvId && 'hidden lg:flex',
        )}>
          {!activeConvId ? (
            <EmptyState
              icon={MessageSquare}
              title="Select a conversation"
              description="Pick a parent from the list to chat in real time."
            />
          ) : (
            <>
              {/* Header */}
              <header className="p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-3">
                <button
                  onClick={closeConv}
                  className="lg:hidden p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800"
                >
                  <ArrowLeft size={16} />
                </button>
                {activeConv && (
                  <>
                    <Avatar name={activeConv.user?.full_name || activeConv.user?.email} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {activeConv.user?.full_name || activeConv.user?.email || 'Parent'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-500 flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Real-time
                      </div>
                    </div>
                  </>
                )}
              </header>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-5 bg-slate-50/50 dark:bg-zinc-950/50">
                {loadingMsgs ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-2/3" />
                    <Skeleton className="h-10 w-1/2 ml-auto" />
                    <Skeleton className="h-14 w-2/3" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="grid place-items-center h-full text-center">
                    <div>
                      <MessageSquare size={32} className="mx-auto text-slate-300 dark:text-zinc-700 mb-2" />
                      <p className="text-sm text-slate-500 dark:text-zinc-500">
                        No messages yet. Say hello!
                      </p>
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-2.5">
                    {messages.map((m, i) => {
                      const isMe  = m.sender_id === user?.id
                      const prev  = messages[i - 1]
                      const showDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at)
                      const isOptimistic = m.id?.startsWith('opt_')
                      return (
                        <li key={m.id}>
                          {showDay && (
                            <div className="text-center my-3">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500 px-2.5 py-1 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                                {dayLabel(m.created_at)}
                              </span>
                            </div>
                          )}
                          <div className={cn('flex gap-2 group', isMe && 'flex-row-reverse')}>
                            <div className={cn(
                              'max-w-[75%] sm:max-w-md rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                              isMe
                                ? 'bg-brand-700 text-white rounded-br-sm dark:bg-white dark:text-black'
                                : 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-700 rounded-bl-sm',
                              isOptimistic && 'opacity-70',
                            )}>
                              <MessageContent content={m.content} isMe={isMe} />
                              <div className={cn(
                                'text-[10px] mt-1 flex items-center gap-1',
                                isMe
                                  ? 'text-brand-100 dark:text-zinc-600 justify-end'
                                  : 'text-slate-400 dark:text-zinc-500',
                              )}>
                                {timeOnly(m.created_at)}
                                {isMe && (
                                  m.read_at
                                    ? <CheckCheck size={11} className="text-brand-200 dark:text-zinc-500" />
                                    : isOptimistic
                                      ? <span className="inline-block w-2.5 h-2.5 rounded-full border-[1.5px] border-brand-200 border-t-transparent animate-spin" />
                                      : <Check size={11} />
                                )}
                              </div>
                            </div>
                            {!isOptimistic && (
                              <button
                                onClick={() => deleteMessage(m.id)}
                                className="opacity-0 group-hover:opacity-100 self-center p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                                aria-label="Delete"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <form
                onSubmit={sendMessage}
                className="p-3 border-t border-slate-200 dark:border-zinc-800"
              >
                {uploadPct > 0 && (
                  <div className="mb-2">
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden">
                      <div className="h-full bg-brand-500 transition-all duration-300"
                        style={{ width: `${uploadPct}%` }} />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">Uploading… {uploadPct}%</div>
                  </div>
                )}
                {recording ? (
                  <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-900/50">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                    <span className="text-sm font-semibold text-red-700 dark:text-red-400 tabular-nums">
                      {fmtRecordTime(recordSecs)}
                    </span>
                    <span className="text-xs text-red-500/80 dark:text-red-400/70 flex-1">Recording voice message…</span>
                    <button
                      type="button"
                      title="Cancel"
                      onClick={cancelRecording}
                      className="p-2 rounded-lg text-red-600 hover:bg-red-100 dark:hover:bg-red-500/20 transition"
                    >
                      <Trash size={16} />
                    </button>
                    <Button type="button" onClick={finishRecording}>
                      <Square size={13} /> Stop &amp; Send
                    </Button>
                  </div>
                ) : (
                <div className="flex items-end gap-2">
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,application/pdf,.doc,.docx,.txt,.zip,.xls,.xlsx,.ppt,.pptx"
                    onChange={onPickFile}
                  />
                  {/* Attach file */}
                  <button
                    type="button"
                    title="Attach file"
                    disabled={sending}
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
                  >
                    <Paperclip size={18} />
                  </button>
                  {/* Camera */}
                  <button
                    type="button"
                    title="Take a photo"
                    disabled={sending}
                    onClick={() => setCameraOpen(true)}
                    className="p-2.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
                  >
                    <Camera size={18} />
                  </button>
                  {/* Voice message */}
                  <button
                    type="button"
                    title="Record a voice message"
                    disabled={sending}
                    onClick={startRecording}
                    className="p-2.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
                  >
                    <Mic size={18} />
                  </button>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                    placeholder="Type a message… (Enter to send)"
                    rows={1}
                    disabled={sending}
                    className="flex-1 resize-none px-3.5 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 outline-none max-h-32"
                  />
                  <Button type="submit" loading={sending} disabled={!draft.trim() || sending}>
                    {!sending && <><Send size={14} /> Send</>}
                  </Button>
                </div>
                )}
              </form>

              {cameraOpen && (
                <CameraCapture
                  onClose={() => setCameraOpen(false)}
                  onCapture={(file) => { setCameraOpen(false); sendFile(file) }}
                />
              )}
            </>
          )}
        </section>
      </div>
    </>
  )
}

/* ─── helpers ─── */
function dayKey(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date(); const yest = new Date()
  yest.setDate(yest.getDate() - 1)
  if (dayKey(iso) === dayKey(today.toISOString())) return 'Today'
  if (dayKey(iso) === dayKey(yest.toISOString()))  return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
function timeOnly(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)        return 'now'
  if (s < 3600)      return `${Math.floor(s / 60)}m`
  if (s < 86400)     return `${Math.floor(s / 3600)}h`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Camera capture modal ─────────────────────────────────────────────
// Desktop: opens the webcam via getUserMedia. After capture, shows a
// preview with Retake / Send. Cancel closes without sending.
function CameraCapture({ onClose, onCapture }) {
  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const [shot, setShot]   = useState(null)   // dataURL of captured frame
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' }, audio: false,
        })
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (e) {
        setError('Could not access the camera. Check browser permissions.')
      }
    })()
    return () => {
      active = false
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const takeShot = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    setShot(canvas.toDataURL('image/jpeg', 0.9))
  }

  const confirm = () => {
    if (!shot) return
    // dataURL -> File
    const arr = shot.split(',')
    const bstr = atob(arr[1])
    const u8 = new Uint8Array(bstr.length)
    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i)
    const file = new File([u8], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
    onCapture(file)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
          <span className="text-sm font-bold text-slate-900 dark:text-white">Take a photo</span>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="bg-black aspect-video flex items-center justify-center">
          {error ? (
            <div className="text-center text-white/80 text-sm px-6 py-10">{error}</div>
          ) : shot ? (
            <img src={shot} alt="preview" className="w-full h-full object-contain" />
          ) : (
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
          )}
        </div>

        <div className="flex items-center justify-center gap-3 px-4 py-3">
          {error ? (
            <Button variant="secondary" onClick={onClose}>Close</Button>
          ) : shot ? (
            <>
              <Button variant="secondary" onClick={() => setShot(null)}>Retake</Button>
              <Button onClick={confirm}><Send size={14} /> Send</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={takeShot}><Camera size={14} /> Capture</Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}