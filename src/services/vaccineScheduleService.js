// src/services/vaccineScheduleService.js
//
// Admin CRUD for the master vaccine schedule (vaccine_schedule table) —
// the source of truth that automatically decides what's due for every
// infant. Editing here does NOT retroactively touch infants who already
// had their schedule generated at birth — it only affects newly
// registered infants going forward.

import { supabase } from '../supabaseClient'

export const vaccineScheduleService = {
  async list() {
    const { data, error } = await supabase
      .from('vaccine_schedule')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('recommended_age_months', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async create(row) {
    const payload = {
      vaccine_name: row.vaccine_name?.trim(),
      dose_number: Number(row.dose_number) || 1,
      recommended_age_months: Number(row.recommended_age_months) || 0,
      description: row.description?.trim() || null,
      sort_order: Number(row.sort_order) || 0,
    }
    if (!payload.vaccine_name) throw new Error('Vaccine name is required.')
    const { data, error } = await supabase.from('vaccine_schedule').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async update(id, row) {
    const payload = {
      vaccine_name: row.vaccine_name?.trim(),
      dose_number: Number(row.dose_number) || 1,
      recommended_age_months: Number(row.recommended_age_months) || 0,
      description: row.description?.trim() || null,
      sort_order: Number(row.sort_order) || 0,
    }
    if (!payload.vaccine_name) throw new Error('Vaccine name is required.')
    const { data, error } = await supabase.from('vaccine_schedule').update(payload).eq('id', id).select().single()
    if (error) throw error
    return data
  },

  async remove(id) {
    const { error } = await supabase.from('vaccine_schedule').delete().eq('id', id)
    if (error) throw error
  },
}
