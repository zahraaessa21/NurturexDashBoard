// src/services/appointmentService.js
//
// Appointments. RLS scopes: doctors see their own; admins see all.

import { supabase } from '../supabaseClient'

const SELECT = `
  *,
  parent:parent_id(id, full_name, phone),
  infant:infant_id(id, name),
  doctor:doctor_id(id, full_name)
`

export const appointmentService = {
  /**
   * @param {Object} opts
   * @param {string} [opts.doctorId]      filter by doctor (admin view)
   * @param {string} [opts.status]        'all' | 'scheduled' | 'completed' | 'canceled' | 'no_show'
   * @param {string} [opts.from]          ISO date - inclusive
   * @param {string} [opts.to]            ISO date - inclusive
   * @param {string} [opts.search]        free-text search in notes/location/type
   * @param {string} [opts.patientId]
   * @param {string} [opts.infantId]
   * @param {number} [opts.page]
   * @param {number} [opts.pageSize]
   */
  async list({
    doctorId, status = 'all', from, to, search = '',
    patientId, infantId, page = 1, pageSize = 50,
  } = {}) {
    let q = supabase
      .from('appointments')
      .select(SELECT, { count: 'exact' })
      .order('scheduled_at', { ascending: true })

    if (doctorId)              q = q.eq('doctor_id', doctorId)
    if (patientId)             q = q.eq('parent_id', patientId)
    if (infantId)              q = q.eq('infant_id', infantId)
    if (status !== 'all')      q = q.eq('status', status)
    if (from)                  q = q.gte('scheduled_at', from)
    if (to)                    q = q.lte('scheduled_at', to)
    if (search.trim()) {
      const s = `%${search.trim()}%`
      q = q.or(`notes.ilike.${s},location.ilike.${s},appt_type.ilike.${s}`)
    }

    const start = (page - 1) * pageSize
    q = q.range(start, start + pageSize - 1)

    const { data, error, count } = await q
    if (error) throw error
    return { rows: data ?? [], total: count ?? 0 }
  },

  /** All appointments for a single month — used by the calendar grid. */
  async listForMonth({ doctorId, year, month }) {
    const first = new Date(Date.UTC(year, month - 1, 1)).toISOString()
    const last  = new Date(Date.UTC(year, month, 1)).toISOString()
    let q = supabase
      .from('appointments')
      .select(SELECT)
      .gte('scheduled_at', first)
      .lt('scheduled_at',  last)
      .order('scheduled_at', { ascending: true })
    if (doctorId) q = q.eq('doctor_id', doctorId)
    const { data, error } = await q
    if (error) throw error
    return data ?? []
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('appointments').select(SELECT).eq('id', id).maybeSingle()
    if (error) throw error
    return data
  },

  async create(input) {
    // ── Validation (server-side guard; UI also validates) ──────────────
    // Required: a scheduled date/time.
    if (!input.scheduled_at) {
      throw new Error('Please choose a date and time for the appointment.')
    }
    const when = new Date(input.scheduled_at)
    if (Number.isNaN(when.getTime())) {
      throw new Error('The appointment date/time is invalid.')
    }
    // No past appointments (covers past dates AND today with a past time).
    if (when.getTime() < Date.now()) {
      throw new Error('You cannot book an appointment in the past.')
    }

    const doctorId = input.doctor_id ?? null
    const parentId = input.parent_id ?? null

    // Prevent duplicate: same doctor + same exact time, not canceled.
    if (doctorId) {
      const { data: clash, error: clashErr } = await supabase
        .from('appointments')
        .select('id')
        .eq('doctor_id', doctorId)
        .eq('scheduled_at', when.toISOString())
        .neq('status', 'canceled')
        .limit(1)
      if (clashErr) throw clashErr
      if (clash && clash.length > 0) {
        throw new Error(
          'An appointment already exists for this date and time. Please choose another slot.'
        )
      }
    }

    const row = {
      doctor_id:    doctorId,
      parent_id:    parentId,
      infant_id:    input.infant_id ?? null,
      scheduled_at: when.toISOString(),
      duration_min: input.duration_min ? Number(input.duration_min) : 30,
      appt_type:    input.appt_type ?? 'checkup',
      status:       input.status ?? 'scheduled',
      location:     input.location?.trim() || null,
      notes:        input.notes?.trim() || null,
    }
    const { data, error } = await supabase
      .from('appointments').insert(row).select(SELECT).single()
    if (error) throw error
    return data
  },

  async update(id, patch) {
    const allowed = ['parent_id','infant_id','scheduled_at','duration_min','appt_type','status','location','notes']
    const cleaned = Object.fromEntries(
      Object.entries(patch).filter(([k]) => allowed.includes(k))
    )
    const { data, error } = await supabase
      .from('appointments').update(cleaned).eq('id', id).select(SELECT).single()
    if (error) throw error
    return data
  },

  // Alias for setStatus
  async updateStatus(id, status) {
    return this.setStatus(id, status)
  },

  async setStatus(id, status) {
    const { data, error } = await supabase
      .from('appointments').update({ status }).eq('id', id).select(SELECT).single()
    if (error) throw error
    return data
  },

  async remove(id) {
    const { error } = await supabase.from('appointments').delete().eq('id', id)
    if (error) throw error
  },

  /** "Today" + "this week" snapshot for a doctor's dashboard. */
  async todayAndUpcoming({ doctorId, days = 7 }) {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end   = new Date(start.getTime() + days * 86400000)
    let q = supabase
      .from('appointments')
      .select(SELECT)
      .gte('scheduled_at', start.toISOString())
      .lt('scheduled_at',  end.toISOString())
      .neq('status', 'canceled')
      .order('scheduled_at', { ascending: true })
    if (doctorId) q = q.eq('doctor_id', doctorId)
    const { data, error } = await q
    if (error) throw error
    return data ?? []
  },
}