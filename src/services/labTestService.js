// src/services/labTestService.js
//
// Laboratory Tests — a doctor requests one or more from a predefined
// checklist (or a custom one) for an appointment; results eventually get
// uploaded by the parent via chat, and the doctor marks them reviewed.

import { supabase } from '../supabaseClient'

export const COMMON_LAB_TESTS = [
  'Complete Blood Count (CBC)',
  'Hemoglobin',
  'Iron Level',
  'Vitamin D',
  'Bilirubin',
  'Blood Glucose',
  'Urine Analysis',
  'Stool Analysis',
]

export const labTestService = {
  async listForAppointment(appointmentId) {
    const { data, error } = await supabase
      .from('lab_tests')
      .select('*')
      .eq('appointment_id', appointmentId)
      .order('requested_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async listForInfant(infantId) {
    const { data, error } = await supabase
      .from('lab_tests')
      .select('*')
      .eq('infant_id', infantId)
      .order('requested_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  /** "Send Lab Request" — inserts one row per selected test (+ optional custom entries). */
  async requestTests({ appointmentId, infantId, doctorId, testNames, customNames = [] }) {
    const rows = [
      ...testNames.map(name => ({ appointment_id: appointmentId, infant_id: infantId, doctor_id: doctorId, test_name: name, is_custom: false })),
      ...customNames.filter(Boolean).map(name => ({ appointment_id: appointmentId, infant_id: infantId, doctor_id: doctorId, test_name: name, is_custom: true })),
    ]
    if (rows.length === 0) throw new Error('Select at least one test.')

    const { data, error } = await supabase.from('lab_tests').insert(rows).select()
    if (error) throw error
    return data ?? []
  },

  async markReviewed(id, notes) {
    const { data, error } = await supabase
      .from('lab_tests')
      .update({ status: 'reviewed', reviewed_at: new Date().toISOString(), doctor_notes: notes?.trim() || null })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id) {
    const { error } = await supabase.from('lab_tests').delete().eq('id', id)
    if (error) throw error
  },

  async notifyResult({ parentId, infantName, testName, resultNote }) {
    if (!parentId) return
    const { error } = await supabase.from('notification_history').insert({
      user_id: parentId,
      type: 'general',
      title: `${testName} result — ${infantName}`,
      body: resultNote?.trim() || `Your doctor has reviewed the ${testName} results for ${infantName}.`,
      payload: { test_name: testName },
    })
    if (error) throw error
  },

  /**
   * ONE notification describing every lab test just requested — fires
   * once when the doctor sends the whole staged list, not once per test.
   *
   * `tests` should be the actual rows returned by requestTests() (they
   * have `id`, `test_name`, `is_custom`) — NOT just a list of name
   * strings. We need the ids so the mobile "Send Results" upload flow
   * (Part 3) can attach a file to the exact right lab_tests row.
   *
   * payload shape (this is the "card" contract mobile will render):
   * {
   *   appointment_id: string,
   *   infant_id: string,
   *   infant_name: string,
   *   tests: [{ id: string, name: string, is_custom: boolean }]
   * }
   */
  async notifyParent({ parentId, appointmentId, infantId, infantName, tests }) {
    if (!parentId || !tests?.length) return
    const { error } = await supabase.from('notification_history').insert({
      user_id: parentId,
      type: 'lab_tests_requested',
      title: tests.length === 1
        ? `Laboratory test requested for ${infantName}`
        : `${tests.length} laboratory tests requested for ${infantName}`,
      body: `Your child needs the following laboratory tests:\n${tests.map(t => `• ${t.test_name}`).join('\n')}`,
      payload: {
        appointment_id: appointmentId,
        infant_id: infantId,
        infant_name: infantName,
        tests: tests.map(t => ({ id: t.id, name: t.test_name, is_custom: t.is_custom })),
      },
    })
    if (error) throw error
  },
}