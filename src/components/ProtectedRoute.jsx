// src/components/ProtectedRoute.jsx
//
// Role-based route guard. Decision tree:
//
//   1. While auth is loading       → spinner
//   2. Loading drags on too long,
//      but we DO have a session    → "still connecting" screen with retry
//      (NOT an automatic logout — a slow network check is not the same
//      thing as being unauthorized; see AuthContext for why this matters)
//   3. No session                  → /auth
//   4. Profile error (no role)     → /auth
//   5. Role mismatches required    → redirect to the user's actual home
//   6. All good                    → render

import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useAuth, isValidRole, homeForRole } from '../contexts/AuthContext'
import { FullPageSpinner } from './ui/Spinner'

// AuthContext itself retries profile/session lookups up to 2 attempts x 6s
// (~13s worst case) before giving up. This safety net must comfortably
// outlast that so it doesn't fire while a legitimate retry is still running.
const SAFETY_TIMEOUT_MS = 16_000

export default function ProtectedRoute({ children, requiredRole }) {
  const { session, role, loading, profileError, refreshProfile } = useAuth()

  const [bailOut, setBailOut] = useState(false)
  useEffect(() => {
    if (!loading) { setBailOut(false); return }
    const t = setTimeout(() => setBailOut(true), SAFETY_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [loading])

  if (loading && !bailOut) {
    return <FullPageSpinner message="Loading…" />
  }

  // We have a session but couldn't resolve the profile even after the full
  // retry budget. This is almost always a network problem, not an actual
  // sign-out — so offer a retry instead of silently redirecting to /auth
  // and making the person log in again for no reason.
  if (loading && bailOut && session) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 dark:bg-black px-5">
        <div className="max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-zinc-900 text-brand-700 dark:text-white grid place-items-center mx-auto mb-4">
            <RefreshCw size={22} />
          </div>
          <h2 className="font-bold text-slate-900 dark:text-white">Still connecting…</h2>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-zinc-400">
            This is taking longer than usual. Your session is still active — check your connection and try again.
          </p>
          <button
            onClick={() => refreshProfile()}
            className="mt-5 inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800 dark:bg-white dark:text-black transition"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/auth" replace />
  }

  // Profile failed to load, or role is invalid → not authorized.
  if (profileError || !role || !isValidRole(role)) {
    return <Navigate to="/auth" replace />
  }

  // Role gate: redirect to the user's real home.
  if (requiredRole && role !== requiredRole) {
    return <Navigate to={homeForRole(role)} replace />
  }

  return children
}
