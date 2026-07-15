// src/services/doctorApplicationsAdminService.js
//
// Admin-only. Lists pending/approved/rejected applications, generates
// signed URLs to view uploaded documents, and drives the approve/reject
// workflow: create the auth account + profile, then call the
// send-doctor-decision-email Edge Function (which holds the Resend key).

import { supabase } from '../supabaseClient'

const BUCKET = 'doctor-applications'

// Pulls the real error message out of a FunctionsHttpError. supabase-js
// only gives us a generic "non-2xx status code" in error.message — the
// actual reason our function sent back is in error.context (the Response).
async function extractFunctionError(error, fallback) {
  if (!error) return null
  try {
    if (error.context && typeof error.context.json === 'function') {
      const body = await error.context.json()
      if (body?.error) return body.error
    }
  } catch {
    // response wasn't JSON — fall through to generic message
  }
  return error.message || fallback
}

export const doctorApplicationsAdminService = {
  async list({ status = 'pending', search = '', page = 1, pageSize = 10 } = {}) {
    let query = supabase
      .from('doctor_applications')
      .select('*', { count: 'exact' })
      .order('submitted_at', { ascending: false })

    if (status !== 'all') query = query.eq('status', status)
    if (search.trim()) {
      const s = `%${search.trim()}%`
      query = query.or(`full_name.ilike.${s},email.ilike.${s}`)
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data, error, count } = await query
    if (error) throw error
    return { rows: data ?? [], total: count ?? 0 }
  },

  /** Cheap count-only query for the sidebar badge — no rows fetched. */
  async countPending() {
    const { count, error } = await supabase
      .from('doctor_applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    if (error) throw error
    return count ?? 0
  },

  /** Signed URL (2 min) so the admin can view the CV / license in a new tab. */
  async getDocUrl(path) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120)
    if (error) throw error
    return data.signedUrl
  },

  // Everything — account creation, profile row, email — now happens
  // server-side in the Edge Function, so the browser never touches
  // auth.signUp (which was hitting Supabase's rate limit on repeated tests).
  async approve(application) {
    const { data, error } = await supabase.functions.invoke('process-doctor-application', {
      body: { type: 'approve', applicationId: application.id },
    })
    if (error) throw new Error(await extractFunctionError(error, 'Approval failed.'))
    if (data?.ok === false) throw new Error(data.error || 'Approval failed.')
    return data
  },

  async reject(application, reason) {
    const { data, error } = await supabase.functions.invoke('process-doctor-application', {
      body: { type: 'reject', applicationId: application.id, reason },
    })
    if (error) throw new Error(await extractFunctionError(error, 'Rejection failed.'))
    if (data?.ok === false) throw new Error(data.error || 'Rejection failed.')
    return data
  },
}
