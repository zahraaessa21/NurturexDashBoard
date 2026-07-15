// src/services/doctorApplicationService.js
//
// Public-facing: used by the un-authenticated "Join as Doctor" form.
// Uploads CV + license to the private `doctor-applications` bucket, then
// inserts the application row. Both steps are allowed for anon by RLS
// (see sql/2026-07-doctor-applications.sql) — nothing here requires login.

import { supabase } from '../supabaseClient'

const BUCKET = 'doctor-applications'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const PDF_TYPE = 'application/pdf'
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function assertFile(file, label, { allowImages = false } = {}) {
  if (!file) throw new Error(`${label} is required.`)
  const allowed = allowImages ? [PDF_TYPE, ...IMAGE_TYPES] : [PDF_TYPE]
  if (!allowed.includes(file.type)) {
    throw new Error(allowImages
      ? `${label} must be a PDF, PNG, or JPG file.`
      : `${label} must be a PDF file.`)
  }
  if (file.size > MAX_BYTES) throw new Error(`${label} must be smaller than 5 MB.`)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[+\d][\d\s-]{6,}$/

export function validateApplication(form) {
  const errors = {}

  if (!form.fullName?.trim()) errors.fullName = 'Full name is required.'
  if (!form.email?.trim() || !EMAIL_RE.test(form.email.trim())) errors.email = 'Enter a valid email address.'
  if (!form.phone?.trim() || !PHONE_RE.test(form.phone.trim())) errors.phone = 'Enter a valid phone number.'
  if (!form.gender) errors.gender = 'Select a gender.'
  if (!form.dateOfBirth) errors.dateOfBirth = 'Date of birth is required.'
  else {
    const age = (Date.now() - new Date(form.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000)
    if (age < 21) errors.dateOfBirth = 'You must be at least 21 years old to register as a doctor.'
  }
  if (!form.password || form.password.length < 8) errors.password = 'Password must be at least 8 characters.'
  else if (!/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
    errors.password = 'Use upper- and lower-case letters and at least one number.'
  }
  if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match.'
  if (!form.specialty) errors.specialty = 'Select a specialty.'
  if (!form.clinicName?.trim()) errors.clinicName = 'Clinic name is required.'
  if (!form.clinicAddress?.trim()) errors.clinicAddress = 'Clinic location is required.'
  if (!form.workingDays || form.workingDays.length === 0) errors.workingDays = 'Select at least one working day.'
  if (!form.startTime) errors.startTime = 'Start time is required.'
  if (!form.endTime) errors.endTime = 'End time is required.'
  if (form.startTime && form.endTime && form.startTime >= form.endTime) {
    errors.endTime = 'End time must be after start time.'
  }
  if (!form.cvFile) errors.cvFile = 'CV (PDF) is required.'
  if (!form.licenseFile) errors.licenseFile = 'Medical license is required.'

  return errors
}

/** Turns selected days + a single start/end time into the working_hours JSON shape. */
export function buildWorkingHours(workingDays, startTime, endTime) {
  return (workingDays ?? []).map((day) => ({ day, start: startTime, end: endTime }))
}

export const doctorApplicationService = {
  /** RPC — never reveals whose email it is, just availability. */
  async checkEmailAvailable(email) {
    const { data, error } = await supabase.rpc('check_doctor_email_available', {
      check_email: email.trim().toLowerCase(),
    })
    if (error) throw error
    return !!data
  },

  /**
   * Uploads CV + license, then creates the pending application row.
   * onProgress(stage) is called with 'cv' | 'license' | 'saving' as each
   * step starts, so the UI can show a simple staged progress indicator.
   */
  async submitApplication(form, onProgress = () => {}) {
    assertFile(form.cvFile, 'CV')
    assertFile(form.licenseFile, 'Medical license', { allowImages: true })

    const applicationId = crypto.randomUUID()
    const cvExt = form.cvFile.name.split('.').pop()?.toLowerCase() || 'pdf'
    const licenseExt = form.licenseFile.name.split('.').pop()?.toLowerCase() || 'pdf'
    const cvPath = `${applicationId}/cv.${cvExt}`
    const licensePath = `${applicationId}/license.${licenseExt}`

    onProgress('cv')
    const { error: cvErr } = await supabase.storage.from(BUCKET).upload(cvPath, form.cvFile, {
      contentType: form.cvFile.type, upsert: false,
    })
    if (cvErr) throw new Error('Could not upload CV: ' + cvErr.message)

    onProgress('license')
    const { error: licErr } = await supabase.storage.from(BUCKET).upload(licensePath, form.licenseFile, {
      contentType: form.licenseFile.type, upsert: false,
    })
    if (licErr) {
      await supabase.storage.from(BUCKET).remove([cvPath]).catch(() => {})
      throw new Error('Could not upload medical license: ' + licErr.message)
    }

    onProgress('saving')
    const { error: insertErr } = await supabase.from('doctor_applications').insert({
      id: applicationId,
      full_name: form.fullName.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      gender: form.gender,
      date_of_birth: form.dateOfBirth,
      specialty: form.specialty,
      clinic_name: form.clinicName.trim(),
      clinic_address: form.clinicAddress.trim(),
      clinic_phone: form.clinicPhone?.trim() || null,
      working_hours: buildWorkingHours(form.workingDays, form.startTime, form.endTime),
      cv_path: cvPath,
      license_path: licensePath,
      status: 'pending',
    })
    if (insertErr) {
      await supabase.storage.from(BUCKET).remove([cvPath, licensePath]).catch(() => {})
      if (insertErr.code === '23505') throw new Error('There is already a pending application for this email.')
      throw new Error(insertErr.message)
    }

    return applicationId
  },
}
