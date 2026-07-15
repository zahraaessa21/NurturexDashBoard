// src/pages/auth/AuthPage.jsx
//
// Sign-in page only — there is no public registration in the two-role
// system. Doctors and admins are seeded by an admin / SQL.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, Mail, Lock, ShieldCheck, ChevronRight, Activity, MessageSquare, Calendar, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { homeForRole } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { supabase } from '../../supabaseClient'
import Logo from '../../components/Logo'
import Button from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'

const FEATURES = [
  { icon: ShieldCheck,    text: 'Bank-grade security & HIPAA-ready data flow' },
  { icon: Calendar,       text: 'Real-time appointment tracking for every clinic' },
  { icon: MessageSquare,  text: 'Direct, secure messaging between doctor and family' },
  { icon: Activity,       text: 'Complete baby health & vaccination records' },
]

export default function AuthPage() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { signIn, resetPassword, updatePassword, session, role, loading: authLoading } = useAuth()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [error,    setError]    = useState('')
  const [busy,     setBusy]     = useState(false)

  // 'signin' | 'forgot' | 'reset' — 'reset' is entered automatically when
  // Supabase reports a PASSWORD_RECOVERY event (the user clicked the link
  // in their reset email and landed back here with a recovery session).
  const [mode, setMode] = useState('signin')
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [newPwd2, setNewPwd2] = useState('')

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('reset')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  /* If a session is already alive, send the user straight to their panel.
     Wait until the role is actually resolved from the DB — not metadata.
     Skipped entirely while in the recovery flow, since a recovery session
     is a real session and we don't want to redirect away from the
     "set new password" form before they've actually set one. */
  useEffect(() => {
    if (mode === 'reset') return
    if (authLoading) return
    if (!session)    return
    if (!role)       return  // still loading, or unauthorized
    navigate(homeForRole(role), { replace: true })
  }, [authLoading, session, role, navigate, mode])

  const handleLogin = async (e) => {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      // signIn returns { profile } with the canonical DB role. We do NOT
      // read user_metadata.role — that's how doctors leak into /admin.
      const { profile: signedInProfile } = await signIn(email, password)
      navigate(homeForRole(signedInProfile.role), { replace: true })
    } catch (err) {
      const msg = friendlyAuthError(err)
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const handleForgotSubmit = async (e) => {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      await resetPassword(resetEmail)
      setResetSent(true)
    } catch (err) {
      const msg = friendlyAuthError(err)
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const handleSetNewPassword = async (e) => {
    e.preventDefault()
    if (busy) return
    setError('')
    if (newPwd.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPwd !== newPwd2) {
      setError('Passwords don\u2019t match.')
      return
    }
    setBusy(true)
    try {
      await updatePassword(newPwd)
      toast.success('Password updated — you can sign in now.')
      setMode('signin')
      setNewPwd(''); setNewPwd2('')
      // The recovery session is still technically "signed in" — sign it
      // out so they land on a clean sign-in form rather than being
      // silently taken into the dashboard on a session they didn't
      // knowingly start just now.
      await supabase.auth.signOut().catch(() => {})
    } catch (err) {
      const msg = friendlyAuthError(err)
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-black">
      {/* ─── Decorative left panel ─── */}
      <aside className="hidden lg:flex flex-1 relative overflow-hidden p-12 items-center justify-center">
        {/* gradient blobs for depth */}
        <div className="absolute -top-32 -left-24 h-80 w-80 rounded-full blur-3xl bg-brand-300/40 dark:bg-white/[0.04] pointer-events-none" />
        <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full blur-3xl bg-sky-300/30 dark:bg-white/[0.03] pointer-events-none" />
        {/* subtle dot grid */}
        <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.06] pointer-events-none"
             style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

        <div className="relative z-10 max-w-lg">
          <Logo size={56} withWordmark wordmarkClass="text-2xl" subtitle="Pediatric care platform" />

          <h1 className="mt-12 mb-5 font-display text-5xl leading-[1.05] tracking-tight text-slate-900 dark:text-white">
            Smart care<br />
            for <em className="text-brand-700 dark:text-brand-300 italic">every child</em>.
          </h1>
          <p className="text-base text-slate-600 dark:text-zinc-400 max-w-md leading-relaxed mb-8">
            NurtureX brings doctors and clinics into one secure workspace —
            so every visit, vaccine, and milestone is one tap away.
          </p>

          <ul className="space-y-3 mb-10">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-slate-700 dark:text-zinc-300">
                <span className="mt-0.5 h-7 w-7 grid place-items-center rounded-lg bg-brand-100 text-brand-700 dark:bg-zinc-900 dark:text-white shrink-0">
                  <Icon size={14} />
                </span>
                <span className="text-sm leading-relaxed">{text}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-4 pt-6 border-t border-slate-200 dark:border-zinc-900">
            <div className="flex -space-x-2">
              {['#2563EB','#0EA5E9','#06B6D4','#10B981'].map((c, i) => (
                <div
                  key={i}
                  className="h-8 w-8 rounded-full ring-2 ring-white dark:ring-black grid place-items-center text-white text-xs font-bold"
                  style={{ background: c }}
                >
                  {String.fromCharCode(65 + i)}
                </div>
              ))}
            </div>
            <span className="text-xs text-slate-500 dark:text-zinc-500">
              Trusted by 1,200+ pediatric professionals
            </span>
          </div>
        </div>
      </aside>

      {/* ─── Form panel ─── */}
      <main className="flex-1 lg:flex-none lg:w-[480px] flex items-center justify-center p-6 sm:p-10 bg-white dark:bg-zinc-950 lg:border-l border-slate-200 dark:border-zinc-900">
        <div className="w-full max-w-sm">
          <button
            onClick={() => navigate('/')}
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-700 dark:text-zinc-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={16} /> Back to Home
          </button>

          <div className="lg:hidden mb-8">
            <Logo size={48} withWordmark wordmarkClass="text-xl" subtitle="Pediatric care" />
          </div>

          {mode === 'signin' && (
            <>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Sign In
              </h2>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-zinc-400">
                Sign in to continue to your dashboard.
              </p>

              {error && (
                <div className="mt-6 rounded-lg border-l-[3px] border-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-3 flex items-start gap-2.5 text-sm text-red-700 dark:text-red-400">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="mt-6" noValidate>
                <Field label="Email address" required>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <Input
                      type="email" autoComplete="email"
                      value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required autoFocus disabled={busy}
                      className="pl-10"
                    />
                  </div>
                </Field>

                <Field label="Password" required>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <Input
                      type={showPwd ? 'text' : 'password'} autoComplete="current-password"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required disabled={busy}
                      className="pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                      tabIndex={-1}
                      aria-label={showPwd ? 'Hide password' : 'Show password'}
                    >
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>

                <div className="flex justify-end -mt-2 mb-4">
                  <button
                    type="button"
                    onClick={() => { setError(''); setResetEmail(email); setResetSent(false); setMode('forgot') }}
                    className="text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button type="submit" block size="lg" loading={busy}>
                  {busy ? 'Signing in…' : <>Sign In <ChevronRight size={16} /></>}
                </Button>
              </form>

              <div className="mt-5 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-4 py-3 text-xs text-slate-600 dark:text-zinc-400 leading-relaxed flex items-center justify-between gap-2">
                <span>Don't have an account?</span>
                <button
                  type="button"
                  onClick={() => navigate('/register/doctor')}
                  className="font-semibold text-brand-700 dark:text-white hover:underline shrink-0"
                >
                  Register here
                </button>
              </div>

              <p className="mt-6 text-xs text-slate-500 dark:text-zinc-500 text-center leading-relaxed">
                By continuing you agree to our{' '}
                <a className="text-brand-700 dark:text-white font-medium hover:underline" href="#terms">Terms</a>{' '}
                and{' '}
                <a className="text-brand-700 dark:text-white font-medium hover:underline" href="#privacy">Privacy Policy</a>.
              </p>
            </>
          )}

          {mode === 'forgot' && (
            <>
              <button
                type="button"
                onClick={() => { setError(''); setMode('signin') }}
                className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-700 dark:text-zinc-400 dark:hover:text-white transition-colors"
              >
                <ArrowLeft size={16} /> Back to Sign In
              </button>

              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Reset Password
              </h2>

              {resetSent ? (
                <div className="mt-6 rounded-lg border-l-[3px] border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-4 flex items-start gap-2.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  <span>
                    If an account exists for <strong>{resetEmail}</strong>, a reset link has
                    been sent. Check that inbox (and spam folder) — the link takes you back
                    here to set a new password.
                  </span>
                </div>
              ) : (
                <>
                  <p className="mt-1.5 text-sm text-slate-500 dark:text-zinc-400">
                    Enter your account email — we'll send a link to reset your password.
                  </p>

                  {error && (
                    <div className="mt-6 rounded-lg border-l-[3px] border-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-3 flex items-start gap-2.5 text-sm text-red-700 dark:text-red-400">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <form onSubmit={handleForgotSubmit} className="mt-6" noValidate>
                    <Field label="Email address" required>
                      <div className="relative">
                        <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <Input
                          type="email" autoComplete="email"
                          value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                          placeholder="you@example.com"
                          required autoFocus disabled={busy}
                          className="pl-10"
                        />
                      </div>
                    </Field>

                    <Button type="submit" block size="lg" loading={busy}>
                      {busy ? 'Sending…' : 'Send Reset Link'}
                    </Button>
                  </form>
                </>
              )}
            </>
          )}

          {mode === 'reset' && (
            <>
              <div className="mb-4 inline-flex items-center gap-2 text-brand-700 dark:text-brand-300">
                <KeyRound size={18} />
                <span className="text-xs font-semibold uppercase tracking-wide">Password Recovery</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Set a New Password
              </h2>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-zinc-400">
                Choose a new password for your account.
              </p>

              {error && (
                <div className="mt-6 rounded-lg border-l-[3px] border-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-3 flex items-start gap-2.5 text-sm text-red-700 dark:text-red-400">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSetNewPassword} className="mt-6" noValidate>
                <Field label="New password" required>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <Input
                      type={showPwd ? 'text' : 'password'} autoComplete="new-password"
                      value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
                      placeholder="At least 8 characters"
                      required autoFocus disabled={busy}
                      className="pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                      tabIndex={-1}
                      aria-label={showPwd ? 'Hide password' : 'Show password'}
                    >
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>

                <Field label="Confirm new password" required>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <Input
                      type={showPwd ? 'text' : 'password'} autoComplete="new-password"
                      value={newPwd2} onChange={(e) => setNewPwd2(e.target.value)}
                      placeholder="Retype the password"
                      required disabled={busy}
                      className="pl-10"
                    />
                  </div>
                </Field>

                <Button type="submit" block size="lg" loading={busy}>
                  {busy ? 'Updating…' : 'Update Password'}
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function friendlyAuthError(err) {
  const msg = err?.message ?? 'Something went wrong. Please try again.'
  if (/invalid login/i.test(msg))             return 'Invalid email or password.'
  if (/email not confirmed/i.test(msg))       return 'Please confirm your email before signing in.'
  if (/network|fetch|failed to fetch/i.test(msg)) return 'Network error — check your connection and try again.'
  if (/rate limit/i.test(msg))                return 'Too many attempts. Please wait and try again.'
  return msg
}
