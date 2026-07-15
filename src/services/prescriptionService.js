// src/services/prescriptionService.js
//
// Structured medication prescriptions (not free-text) — linked to an
// appointment and the infant's medical history.

import { supabase } from '../supabaseClient'

export const prescriptionService = {
  async listForAppointment(appointmentId) {
    const { data, error } = await supabase
      .from('infant_medications')
      .select('*')
      .eq('appointment_id', appointmentId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async listForInfant(infantId) {
    const { data, error } = await supabase
      .from('infant_medications')
      .select('*')
      .eq('infant_id', infantId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  /** "Prescribe Medication" — single item, kept for any other call sites. */
  async create({ appointmentId, infantId, doctorId, medicationName, dosage, frequency, duration, instructions, startDate, endDate }) {
    if (!medicationName?.trim()) throw new Error('Medication name is required.')
    if (!dosage?.trim()) throw new Error('Dosage is required.')
    if (!frequency?.trim()) throw new Error('Frequency is required.')
    if (!duration?.trim()) throw new Error('Duration is required.')

    const row = {
      appointment_id: appointmentId,
      infant_id: infantId,
      doctor_id: doctorId,
      medication_name: medicationName.trim(),
      dosage: dosage.trim(),
      frequency: frequency.trim(),
      duration: duration.trim(),
      instructions: instructions?.trim() || null,
      start_date: startDate || new Date().toISOString().slice(0, 10),
      end_date: endDate || null,
      status: 'active',
    }
    const { data, error } = await supabase.from('infant_medications').insert(row).select().single()
    if (error) throw error
    return data
  },

  /**
   * "Send" for the medication staging list — inserts every drafted
   * medication in ONE batch call, matching how labTestService.requestTests
   * already handles multiple lab tests. Used instead of calling create()
   * once per item, which used to also fire a separate notification each
   * time — the actual bug being fixed here.
   */
  async createBatch({ appointmentId, infantId, doctorId, items }) {
    const rows = items.map((m) => {
      if (!m.medicationName?.trim()) throw new Error('Medication name is required.')
      if (!m.dosage?.trim()) throw new Error('Dosage is required.')
      if (!m.frequency?.trim()) throw new Error('Frequency is required.')
      if (!m.duration?.trim()) throw new Error('Duration is required.')
      return {
        appointment_id: appointmentId,
        infant_id: infantId,
        doctor_id: doctorId,
        medication_name: m.medicationName.trim(),
        dosage: m.dosage.trim(),
        frequency: m.frequency.trim(),
        duration: m.duration.trim(),
        instructions: m.instructions?.trim() || null,
        start_date: new Date().toISOString().slice(0, 10),
        status: 'active',
      }
    })
    if (rows.length === 0) throw new Error('Add at least one medication first.')
    const { data, error } = await supabase.from('infant_medications').insert(rows).select()
    if (error) throw error
    return data ?? []
  },

  async setStatus(id, status) {
    const { data, error } = await supabase
      .from('infant_medications').update({ status }).eq('id', id).select().single()
    if (error) throw error
    return data
  },

  async remove(id) {
    const { error } = await supabase.from('infant_medications').delete().eq('id', id)
    if (error) throw error
  },

  /**
   * ONE notification describing every medication just prescribed —
   * replaces the old per-medication notifyParent, which used to fire
   * once for each item added. `medications` is the full batch just
   * created via createBatch().
   *
   * payload shape (matches the lab-tests card contract):
   * {
   *   appointment_id: string,
   *   infant_id: string,
   *   infant_name: string,
   *   medications: [{ id, name, dosage, frequency, duration, instructions }]
   * }
   */
  async notifyParent({ parentId, appointmentId, infantId, infantName, medications }) {
    if (!parentId || !medications?.length) return
    const lines = medications.map(m => `${m.medication_name} — ${m.dosage}, ${m.frequency}, ${m.duration}`)
    const { error } = await supabase.from('notification_history').insert({
      user_id: parentId,
      type: 'medications_prescribed',
      title: medications.length === 1
        ? `New medication prescribed for ${infantName}`
        : `${medications.length} medications prescribed for ${infantName}`,
      body: lines.join('\n'),
      payload: {
        appointment_id: appointmentId,
        infant_id: infantId,
        infant_name: infantName,
        medications: medications.map(m => ({
          id: m.id, name: m.medication_name, dosage: m.dosage,
          frequency: m.frequency, duration: m.duration, instructions: m.instructions,
        })),
      },
    })
    if (error) throw error
  },
}