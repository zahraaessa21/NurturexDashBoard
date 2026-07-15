// src/services/infantService.js
import { supabase } from '../supabaseClient'

export const infantService = {
  async list({ search = '', status = 'all', doctorId, dateFrom = '', dateTo = '', page = 1, pageSize = 12 } = {}) {
    let q = supabase
      .from('infants')
      .select('*, parent:parent_id(id, full_name, email, avatar_url), doctor:doctor_id(id, full_name, specialty)', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (search.trim()) {
      const s = `%${search.trim()}%`
      // Can't reliably OR a base-table column against an embedded/joined
      // table's column in one PostgREST filter — resolve matching parents
      // first, then OR against infant name + parent_id IN (...).
      const { data: matchedParents } = await supabase
        .from('profiles')
        .select('id')
        .or(`full_name.ilike.${s},email.ilike.${s}`)
      const parentIds = (matchedParents ?? []).map(p => p.id)
      q = parentIds.length > 0
        ? q.or(`name.ilike.${s},parent_id.in.(${parentIds.join(',')})`)
        : q.ilike('name', s)
    }
    if (status !== 'all') q = q.eq('status', status)
    if (doctorId) q = q.eq('doctor_id', doctorId)
    if (dateFrom) q = q.gte('created_at', dateFrom)
    if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59')

    const from = (page - 1) * pageSize
    q = q.range(from, from + pageSize - 1)

    const { data, error, count } = await q
    if (error) throw error
    return { rows: data ?? [], total: count ?? 0 }
  },

  /** Convenience: fetch all infants for a given doctor (no pagination). */
  async listForDoctor(doctorId) {
    const { data, error } = await supabase
      .from('infants')
      .select('*, parent:parent_id(id, full_name, email, avatar_url), doctor:doctor_id(id, full_name, specialty)')
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('infants')
      .select('*, parent:parent_id(id, full_name, email, phone, avatar_url), doctor:doctor_id(id, full_name, specialty)')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async create(input) {
    const row = {
      parent_id:        input.parent_id ?? null,
      doctor_id:        input.doctor_id ?? null,
      name:             input.name?.trim(),
      date_of_birth:    input.date_of_birth || null,
      gender:           input.gender || null,
      birth_weight_kg:  input.birth_weight_kg ? Number(input.birth_weight_kg) : null,
      birth_height_cm:  input.birth_height_cm ? Number(input.birth_height_cm) : null,
      blood_type:       input.blood_type?.trim() || null,
      notes:            input.notes?.trim() || null,
      status:           input.status ?? 'monitoring',
    }
    const { data, error } = await supabase.from('infants').insert(row).select().single()
    if (error) throw error
    return data
  },

  async update(id, patch) {
    const allowed = ['parent_id','doctor_id','name','date_of_birth','gender','birth_weight_kg','birth_height_cm','blood_type','notes','status']
    const cleaned = Object.fromEntries(
      Object.entries(patch).filter(([k]) => allowed.includes(k))
    )
    const { data, error } = await supabase
      .from('infants').update(cleaned).eq('id', id).select().single()
    if (error) throw error
    return data
  },

  async remove(id) {
    const { error } = await supabase.from('infants').delete().eq('id', id)
    if (error) throw error
  },

  /** Status distribution across the doctor's (or all admin's) infants. */
  async statusDistribution({ doctorId } = {}) {
    let q = supabase.from('infants').select('status')
    if (doctorId) q = q.eq('doctor_id', doctorId)
    const { data, error } = await q
    if (error) throw error
    const counts = { monitoring: 0, healthy: 0, at_risk: 0, critical: 0 }
    for (const r of data ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1
    return counts
  },
}