// src/services/medicalNoteService.js
//
// Phase 2 — Medical Notes service (upgraded).
// Supports visit types, diagnosis, parent-visibility, and templates.

import { supabase } from '../supabaseClient'

const SELECT = `
  *,
  infant:infant_id(id, name, date_of_birth),
  doctor:doctor_id(id, full_name, avatar_url, specialty)
`

export const VISIT_TYPES = [
  { value: 'routine',       label: 'Routine Checkup' },
  { value: 'urgent',        label: 'Urgent Visit' },
  { value: 'follow_up',     label: 'Follow-up' },
  { value: 'vaccination',   label: 'Vaccination Visit' },
  { value: 'sick_visit',    label: 'Sick Visit' },
  { value: 'new_born',      label: 'Newborn Exam' },
  { value: 'developmental', label: 'Developmental Assessment' },
]

export const NOTE_TEMPLATES = {
  routine: {
    title: 'Routine Checkup',
    content: 'Baby is in good health overall.\n\nWeight and height are within normal range for age.\nDevelopmental milestones are on track.\nNo acute concerns noted.',
    recommendations: 'Continue current feeding schedule.\nReturn in 1 month for next routine visit.',
  },
  vaccination: {
    title: 'Vaccination Visit',
    content: 'Baby presented for scheduled vaccination.\nVital signs stable. No contraindications noted.\nVaccine administered as per national schedule.',
    recommendations: 'Monitor for fever or irritability for 24–48 hours.\nParacetamol can be given if fever >38°C.\nReturn if any unusual reactions occur.',
  },
  sick_visit: {
    title: 'Sick Visit',
    content: 'Baby presented with [symptoms].\nDuration: [days].\nTemperature: [°C]. Other vitals stable.',
    recommendations: 'Prescribed: [medication and dose].\nEnsure adequate hydration.\nReturn if symptoms worsen or do not improve in 48 hours.',
  },
  new_born: {
    title: 'Newborn Examination',
    content: 'Newborn examination performed.\nWeight: [kg], Length: [cm], Head circumference: [cm].\nAPGAR score at 1 min: [x], at 5 min: [x].\nAll systems examined — no abnormalities detected.',
    recommendations: 'Initiate breastfeeding on demand.\nVitamin D supplementation to begin.\nHearing screening scheduled.\nReturn for 2-week weight check.',
  },
  developmental: {
    title: 'Developmental Assessment',
    content: 'Developmental milestone assessment performed.\nGross motor: [findings].\nFine motor: [findings].\nLanguage: [findings].\nSocial/emotional: [findings].',
    recommendations: 'Milestone progress is [on track / delayed in X area].\n[Specific recommendations or referrals if needed].',
  },
}

export const medicalNoteService = {
  // ── List notes ──────────────────────────────────────────────
  async list({ doctorId, patientId, infantId, page = 1, pageSize = 50 } = {}) {
    let q = supabase
      .from('medical_notes')
      .select(SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
    if (doctorId)  q = q.eq('doctor_id', doctorId)
    if (patientId) q = q.eq('parent_id', patientId)
    if (infantId)  q = q.eq('infant_id', infantId)
    const start = (page - 1) * pageSize
    q = q.range(start, start + pageSize - 1)
    const { data, error, count } = await q
    if (error) throw error
    return { rows: data ?? [], total: count ?? 0 }
  },

  async listForInfant(infantId) {
    const { data, error } = await supabase
      .from('medical_notes')
      .select(SELECT)
      .eq('infant_id', infantId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  // Parent-visible only (for mobile app)
  async listVisibleForInfant(infantId) {
    const { data, error } = await supabase
      .from('medical_notes')
      .select(SELECT)
      .eq('infant_id', infantId)
      .eq('is_parent_visible', true)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async listForAppointment(appointmentId) {
    const { data, error } = await supabase
      .from('medical_notes')
      .select(SELECT)
      .eq('appointment_id', appointmentId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  // ── Create ──────────────────────────────────────────────────
  async create(input) {
    const row = {
      doctor_id:         input.doctor_id ?? null,
      parent_id:         input.parent_id ?? null,
      infant_id:         input.infant_id ?? null,
      appointment_id:    input.appointment_id ?? null,
      visit_type:        input.visit_type ?? 'routine',
      title:             input.title?.trim(),
      content:           input.content?.trim(),
      recommendations:   input.recommendations?.trim() || null,
      diagnosis:         input.diagnosis?.trim() || null,
      is_parent_visible: input.is_parent_visible ?? true,
      is_private:        input.is_private ?? false,
    }
    const { data, error } = await supabase
      .from('medical_notes').insert(row).select(SELECT).single()
    if (error) throw error
    return data
  },

  // ── Update ──────────────────────────────────────────────────
  async update(id, patch) {
    const allowed = [
      'title', 'content', 'recommendations', 'diagnosis',
      'visit_type', 'is_parent_visible', 'is_private',
    ]
    const cleaned = Object.fromEntries(
      Object.entries(patch).filter(([k]) => allowed.includes(k))
    )
    const { data, error } = await supabase
      .from('medical_notes').update(cleaned).eq('id', id).select(SELECT).single()
    if (error) throw error
    return data
  },

  // ── Delete ──────────────────────────────────────────────────
  async remove(id) {
    const { error } = await supabase.from('medical_notes').delete().eq('id', id)
    if (error) throw error
  },

  // ── Toggle parent visibility ────────────────────────────────
  async toggleVisibility(id, isVisible) {
    return medicalNoteService.update(id, { is_parent_visible: isVisible })
  },
}