// src/services/adminService.js
//
// Admin-only doctor CRUD. Creating a doctor uses the isolated
// supabaseAdminScope client so the admin's session isn't replaced.
// Avatar upload is performed AFTER the auth user exists (so the row
// owner can write to the avatars bucket).

import { supabase, supabaseAdminScope } from '../supabaseClient'
import { storageService } from './storageService'

export const adminService = {
  /**
   * Paginated, searchable list of doctors.
   * @param {Object} opts
   * @param {string} [opts.search]
   * @param {'all'|'active'|'inactive'} [opts.status]
   * @param {number} [opts.page]    1-indexed
   * @param {number} [opts.pageSize]
   */
  async listDoctors({ search = '', status = 'all', dateFrom = '', dateTo = '', page = 1, pageSize = 10 } = {}) {
    let query = supabase
      .from('profiles')
      .select('*', { count: 'exact' })
      .eq('role', 'doctor')
      .order('created_at', { ascending: false })

    if (search.trim()) {
      const s = `%${search.trim()}%`
      query = query.or(`full_name.ilike.${s},email.ilike.${s},specialty.ilike.${s}`)
    }
    if (status === 'active')   query = query.eq('status', 'active')
    if (status === 'inactive') query = query.neq('status', 'active')
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo)   query = query.lte('created_at', dateTo + 'T23:59:59')

    const from = (page - 1) * pageSize
    const to   = from + pageSize - 1
    query = query.range(from, to)

    const { data, error, count } = await query
    if (error) throw error
    return { rows: data ?? [], total: count ?? 0 }
  },

  /** Lightweight list of active doctors, used to populate selects. */
  async listDoctorsForSelect({ specialty } = {}) {
    let query = supabase
      .from('profiles')
      .select('id, full_name, specialty')
      .eq('role', 'doctor')
      .eq('status', 'active')
      .order('full_name')
    if (specialty) query = query.eq('specialty', specialty)
    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  /** Aggregate stats for the admin dashboard cards. */
  async getStats() {
    const [doctorsTotal, doctorsActive, patientsTotal, infantsTotal, alertsOpen, recentDoctors] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'doctor'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'doctor').eq('status', 'active'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'parent'),
      supabase.from('infants').select('*', { count: 'exact', head: true }),
      supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('profiles').select('*', { count: 'exact', head: true })
        .eq('role', 'doctor')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ])
    return {
      doctorsTotal:   doctorsTotal.count ?? 0,
      doctorsActive:  doctorsActive.count ?? 0,
      patientsTotal:  patientsTotal.count ?? 0,
      infantsTotal:   infantsTotal.count ?? 0,
      alertsOpen:     alertsOpen.count ?? 0,
      recentDoctors:  recentDoctors.count ?? 0,
      // legacy keys kept for any caller still expecting them
      total:  doctorsTotal.count ?? 0,
      active: doctorsActive.count ?? 0,
      recent: recentDoctors.count ?? 0,
    }
  },

  /** Doctors created per month for the last 6 months — feeds the dashboard chart. */
  async getMonthlyGrowth() {
    const { data, error } = await supabase
      .from('profiles')
      .select('created_at')
      .eq('role', 'doctor')
      .gte('created_at', new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString())
    if (error) throw error
    const buckets = new Map()
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      buckets.set(k, { month: d.toLocaleString('default', { month: 'short' }), count: 0 })
    }
    for (const row of data ?? []) {
      const dt = new Date(row.created_at)
      const k  = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      if (buckets.has(k)) buckets.get(k).count += 1
    }
    return Array.from(buckets.values())
  },

  /**
   * Create a doctor account. Uses the isolated client so the admin
   * stays signed in. Optional avatar file is uploaded after profile row exists.
   */
  async createDoctor({ email, password, fullName, phone, specialty, status = 'active', avatarFile = null }) {
    const cleanEmail = email.trim().toLowerCase()
    const cleanName  = fullName.trim()

    const { data, error } = await supabaseAdminScope.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { full_name: cleanName, role: 'doctor' } },
    })
    if (error) throw error

    const userId = data.user?.id
    if (!userId) throw new Error('Account created but no user ID returned. Check email-confirmation settings.')

    let avatarUrl = null
    if (avatarFile) {
      try { avatarUrl = await storageService.uploadAvatar(userId, avatarFile) }
      catch (e) { console.warn('Avatar upload failed (continuing without):', e.message) }
    }

    const profileRow = {
      id:         userId,
      full_name:  cleanName,
      email:      cleanEmail,
      role:       'doctor',
      phone:      phone?.trim() || null,
      specialty:  specialty?.trim() || null,
      status,
      avatar_url: avatarUrl,
    }
    const { error: upErr } = await supabase
      .from('profiles')
      .upsert(profileRow, { onConflict: 'id' })
    if (upErr) throw new Error(`Auth user created but profile row failed: ${upErr.message}`)

    await supabaseAdminScope.auth.signOut().catch(() => {})
    return profileRow
  },

  /** Edit doctor — accepts optional new avatar file. */
  async updateDoctor(id, { fullName, phone, specialty, status, avatarFile, removeAvatar, currentAvatarUrl }) {
    const patch = {}
    if (fullName  != null) patch.full_name = fullName.trim()
    if (phone     != null) patch.phone     = phone.trim() || null
    if (specialty != null) patch.specialty = specialty.trim() || null
    if (status    != null) patch.status    = status

    if (avatarFile) {
      patch.avatar_url = await storageService.uploadAvatar(id, avatarFile)
      if (currentAvatarUrl) await storageService.deleteByUrl(currentAvatarUrl)
    } else if (removeAvatar) {
      patch.avatar_url = null
      if (currentAvatarUrl) await storageService.deleteByUrl(currentAvatarUrl)
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', id)
      .eq('role', 'doctor')
      .select()
      .single()
    if (error) throw error
    return data
  },

  /**
   * Soft-delete: marks the doctor inactive. Hard auth.users deletion needs
   * the service_role key — should run in a Supabase Edge Function.
   */
  async deleteDoctor(id, { currentAvatarUrl } = {}) {
    if (currentAvatarUrl) await storageService.deleteByUrl(currentAvatarUrl)
    const { error } = await supabase
      .from('profiles')
      .update({ status: 'inactive', role: 'doctor_archived' })
      .eq('id', id)
    if (error) throw error
  },

  /** Appointment count per doctor — feeds the "Appointments per doctor" report chart. */
  async appointmentsByDoctor() {
    const { data, error } = await supabase
      .from('appointments')
      .select('doctor:doctor_id(full_name)')
    if (error) throw error
    const counts = new Map()
    for (const row of data ?? []) {
      const name = row.doctor?.full_name ? `Dr. ${row.doctor.full_name}` : 'Unassigned'
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  },

  /** Doctor count grouped by specialty — feeds a pie chart. */
  async doctorsBySpecialty() {
    const { data, error } = await supabase
      .from('profiles')
      .select('specialty')
      .eq('role', 'doctor')
    if (error) throw error
    const counts = new Map()
    for (const row of data ?? []) {
      const key = row.specialty?.trim() || 'Unspecified'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from(counts.entries()).map(([name, value]) => ({ name, value }))
  },
}
