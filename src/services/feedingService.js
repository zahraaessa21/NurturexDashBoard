// src/services/feedingService.js
//
// Reads/deletes from `feed_logs` — the table the mobile app actually
// writes feeds to. Previously pointed at `feeding_logs`, a separate,
// disconnected table the mobile app never touched, so the doctor-facing
// InfantDetail page showed nothing a parent had logged. See the schema
// migration notes for the one-time data carry-over.
import { supabase } from '../supabaseClient'

export const feedingService = {
  async listForInfant(infantId, { limit = 50 } = {}) {
    const { data, error } = await supabase
      .from('feed_logs')
      .select('*')
      .eq('infant_id', infantId)
      .order('fed_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data ?? []
  },

  async create(input) {
    const row = {
      infant_id: input.infant_id,
      parent_id: input.parent_id ?? null,
      fed_at:    input.fed_at || new Date().toISOString(),
      feed_type: input.feed_type || 'breast_milk',
      name:      input.food_name || input.feed_type || 'Feed',
      detail:    input.detail ?? '',
      amount_ml: input.amount_ml ? Number(input.amount_ml) : null,
      food_name: input.food_name?.trim() || null,
      note:      input.notes?.trim() || null,
    }
    const { data, error } = await supabase.from('feed_logs').insert(row).select().single()
    if (error) throw error
    return data
  },

  async remove(id) {
    const { error } = await supabase.from('feed_logs').delete().eq('id', id)
    if (error) throw error
  },
}