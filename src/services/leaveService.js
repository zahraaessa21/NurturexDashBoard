// src/services/leaveService.js
//
// Emergency Leave — talks to the two Postgres functions from Part 1
// (compute_leave_reschedule_proposals / confirm_leave_and_propose_reschedules).
// previewReschedules() writes nothing — safe to call as many times as
// needed while the doctor is still adjusting the leave window.
// confirmLeave() is the real one — only call it after the doctor has
// reviewed the preview and explicitly confirmed.

import { supabase } from '../supabaseClient'

export const leaveService = {
  async previewReschedules({ doctorId, startAt, endAt }) {
    const { data, error } = await supabase.rpc('compute_leave_reschedule_proposals', {
      p_doctor_id: doctorId,
      p_leave_start: startAt,
      p_leave_end: endAt,
    })
    if (error) throw error
    return data ?? []
  },

  async confirmLeave({ doctorId, startAt, endAt, reason }) {
    const { data, error } = await supabase.rpc('confirm_leave_and_propose_reschedules', {
      p_doctor_id: doctorId,
      p_leave_start: startAt,
      p_leave_end: endAt,
      p_reason: reason?.trim() || null,
    })
    if (error) throw error
    return data ?? []
  },
}
