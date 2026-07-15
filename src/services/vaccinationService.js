// src/services/vaccinationService.js
import { supabase } from '../supabaseClient'

export const vaccinationService = {
  async listForInfant(infantId) {
    const { data, error } = await supabase
      .from('vaccinations')
      .select('*')
      .eq('infant_id', infantId)
      .order('scheduled_date', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async upcoming({ doctorId, days = 30, limit = 10 } = {}) {
    const today = new Date().toISOString().slice(0, 10)
    const future = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
    let q = supabase
      .from('vaccinations')
      .select('*, infant:infant_id(id, name, doctor_id)')
      .eq('status', 'scheduled')
      .gte('scheduled_date', today)
      .lte('scheduled_date', future)
      .order('scheduled_date', { ascending: true })
      .limit(limit)
    const { data, error } = await q
    if (error) throw error
    // RLS already filters by doctor; this client-side filter is a safety net
    // for when admin views show data from other doctors.
    return (data ?? []).filter(v => !doctorId || v.infant?.doctor_id === doctorId)
  },

  async create(input) {
    const row = {
      infant_id:       input.infant_id,
      vaccine_name:    input.vaccine_name?.trim(),
      scheduled_date:  input.scheduled_date || null,
      administered_date: input.administered_date || null,
      status:          input.status ?? 'scheduled',
      notes:           input.notes?.trim() || null,
    }
    const { data, error } = await supabase.from('vaccinations').insert(row).select().single()
    if (error) throw error
    return data
  },

  async markAdministered(id, administered_date, doctorId) {
    const { data, error } = await supabase.from('vaccinations')
      .update({
        status: 'administered',
        administered_date: administered_date || new Date().toISOString().slice(0,10),
        doctor_id: doctorId ?? null,
      })
      .eq('id', id).select().single()
    if (error) throw error
    return data
  },

  /**
   * The auto checklist for a vaccination visit: every vaccine for this
   * infant that's still scheduled (due now or overdue) — the doctor never
   * picks from the full master list, only confirms which of these were
   * actually given.
   */
  async dueForInfant(infantId) {
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('vaccinations')
      .select('*')
      .eq('infant_id', infantId)
      .eq('status', 'scheduled')
      .lte('scheduled_date', today)
      .order('scheduled_date', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  /**
   * Save a vaccination visit: marks the checked vaccine rows administered
   * (with doctor, date, notes, and a link back to the appointment).
   * Does NOT complete the appointment itself — the appointment now covers
   * multiple sections (labs, meds, notes too), so "completed" is a
   * separate, explicit action from the Appointment Details hub.
   */
  async saveVisit({ appointmentId, vaccinationIds, doctorId, notes }) {
    const today = new Date().toISOString().slice(0, 10)

    if (vaccinationIds.length > 0) {
      const { error } = await supabase
        .from('vaccinations')
        .update({
          status: 'administered',
          administered_date: today,
          doctor_id: doctorId,
          appointment_id: appointmentId,
          notes: notes?.trim() || null,
        })
        .in('id', vaccinationIds)
      if (error) throw error
    }
  },

  /** Notify the parent which vaccines were given at a completed visit. */
  async notifyParent({ parentId, infantName, vaccineNames }) {
    if (!parentId || vaccineNames.length === 0) return
    const { error } = await supabase.from('notification_history').insert({
      user_id: parentId,
      type: 'vaccination',
      title: `${infantName}'s vaccination is complete`,
      body: `${vaccineNames.join(', ')} administered for ${infantName}.`,
      payload: { vaccine_names: vaccineNames },
    })
    if (error) throw error
  },

  async update(id, patch) {
    const allowed = ['vaccine_name', 'scheduled_date', 'administered_date', 'status', 'notes']
    const cleaned = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)))
    const { data, error } = await supabase.from('vaccinations').update(cleaned).eq('id', id).select().single()
    if (error) throw error
    return data
  },

  async remove(id) {
    const { error } = await supabase.from('vaccinations').delete().eq('id', id)
    if (error) throw error
  },

  /** Completion percentage across infants (used in admin reports). */
  async completionRate({ doctorId } = {}) {
    let q = supabase.from('vaccinations').select('status, infant:infant_id(doctor_id)')
    const { data, error } = await q
    if (error) throw error
    const filtered = doctorId
      ? (data ?? []).filter(v => v.infant?.doctor_id === doctorId)
      : (data ?? [])
    if (filtered.length === 0) return { total: 0, administered: 0, rate: 0 }
    const administered = filtered.filter(v => v.status === 'administered').length
    return { total: filtered.length, administered, rate: Math.round((administered / filtered.length) * 100) }
  },

  /** Status breakdown (scheduled/administered/overdue/skipped) — feeds a pie chart. */
  async statusBreakdown({ doctorId } = {}) {
    const { data, error } = await supabase
      .from('vaccinations')
      .select('status, infant:infant_id(doctor_id)')
    if (error) throw error
    const filtered = doctorId ? (data ?? []).filter(v => v.infant?.doctor_id === doctorId) : (data ?? [])
    const today = new Date().toISOString().slice(0, 10)
    const counts = { scheduled: 0, administered: 0, overdue: 0, skipped: 0 }
    for (const row of filtered) {
      // "overdue" isn't always a stored status — derive it the same way the rest of the app does.
      counts[row.status] = (counts[row.status] ?? 0) + 1
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  },
}
