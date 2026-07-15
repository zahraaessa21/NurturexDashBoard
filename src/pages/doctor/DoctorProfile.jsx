// src/pages/doctor/DoctorProfile.jsx
//
// Doctor edits their own profile — mirrors everything collected at
// registration: name, phone, gender, date of birth, specialty, bio,
// clinic info, and working days/hours. Email is read-only.

import { useState } from 'react'
import { Save, Mail, ShieldCheck, AlertCircle, Building2, Clock } from 'lucide-react'

import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { profileService } from '../../services/profileService'
import { storageService }  from '../../services/storageService'

import Button from '../../components/ui/Button'
import { Field, Input, Textarea, Select } from '../../components/ui/Field'
import ImageUpload from '../../components/ui/ImageUpload'
import StatusBadge from '../../components/StatusBadge'

const DAYS = [
  { value: 'monday',    label: 'Mon' },
  { value: 'tuesday',   label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday',  label: 'Thu' },
  { value: 'friday',    label: 'Fri' },
  { value: 'saturday',  label: 'Sat' },
  { value: 'sunday',    label: 'Sun' },
]

/** profiles.working_hours is [{ day, start, end }, ...] — one row per
 *  selected day, all sharing the same start/end (how the registration
 *  form writes it). We edit it the same way: pick days + one time range. */
function splitWorkingHours(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { days: [], start: '09:00', end: '17:00' }
  return {
    days: rows.map(r => r.day),
    start: rows[0]?.start ?? '09:00',
    end: rows[0]?.end ?? '17:00',
  }
}
function buildWorkingHours(days, start, end) {
  return days.map(day => ({ day, start, end }))
}

export default function DoctorProfile() {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()

  const initialHours = splitWorkingHours(profile?.working_hours)

  const [form, setForm] = useState({
    full_name:      profile?.full_name ?? '',
    phone:          profile?.phone ?? '',
    gender:         profile?.gender ?? '',
    date_of_birth:  profile?.date_of_birth ?? '',
    specialty:      profile?.specialty ?? profile?.specialization ?? '',
    bio:            profile?.bio ?? '',
    clinic_name:    profile?.clinic_name ?? '',
    clinic_address: profile?.clinic_address ?? '',
    clinic_phone:   profile?.clinic_phone ?? '',
    working_days:   initialHours.days,
    start_time:     initialHours.start,
    end_time:       initialHours.end,
  })
  const [avatarFile,  setAvatarFile]   = useState(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const update = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))
  const toggleDay = (day) => setForm(f => ({
    ...f,
    working_days: f.working_days.includes(day)
      ? f.working_days.filter(d => d !== day)
      : [...f.working_days, day],
  }))

  const onSave = async (e) => {
    e.preventDefault()
    if (saving || !profile?.id) return
    setError('')

    if (form.working_days.length > 0 && form.start_time >= form.end_time) {
      setError('Working hours: end time must be after start time.')
      return
    }

    setSaving(true)
    try {
      const patch = {
        full_name:      form.full_name.trim(),
        phone:          form.phone.trim() || null,
        gender:         form.gender || null,
        date_of_birth:  form.date_of_birth || null,
        specialty:      form.specialty.trim() || null,
        bio:            form.bio.trim() || null,
        clinic_name:    form.clinic_name.trim() || null,
        clinic_address: form.clinic_address.trim() || null,
        clinic_phone:   form.clinic_phone.trim() || null,
        working_hours:  buildWorkingHours(form.working_days, form.start_time, form.end_time),
      }

      // Avatar handling
      if (avatarFile) {
        try {
          const url = await storageService.uploadAvatar(profile.id, avatarFile)
          patch.avatar_url = url
          if (profile.avatar_url) await storageService.deleteByUrl(profile.avatar_url)
        } catch (err) {
          console.warn('avatar upload failed:', err)
          throw new Error(`Avatar upload failed: ${err.message}`)
        }
      } else if (removeAvatar) {
        patch.avatar_url = null
        if (profile.avatar_url) await storageService.deleteByUrl(profile.avatar_url)
      }

      await profileService.update(profile.id, patch)
      await refreshProfile()
      setAvatarFile(null); setRemoveAvatar(false)
      toast.success('Profile updated')
    } catch (err) {
      const msg = err.message ?? 'Could not save'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="mb-7">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">My profile</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-500 mt-1">Everything you set when you registered — edit it any time.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Identity card ── */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-6">
          <div className="flex flex-col items-center text-center">
            <ImageUpload
              value={profile?.avatar_url}
              name={form.full_name}
              size={112}
              onFileSelected={(file) => {
                setAvatarFile(file)
                if (!file && profile?.avatar_url) setRemoveAvatar(true)
                else setRemoveAvatar(false)
              }}
            />
          </div>
          <div className="mt-5 text-center">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Dr. {form.full_name || 'Unnamed'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5 capitalize">{form.specialty || '—'}</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <StatusBadge status={profile?.status ?? 'active'} />
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-zinc-800 dark:text-zinc-200 capitalize">
                <ShieldCheck size={10} /> {profile?.role}
              </span>
            </div>
          </div>

          <hr className="my-5 border-slate-200 dark:border-zinc-800" />

          <div className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2 text-slate-600 dark:text-zinc-400">
              <Mail size={14} className="text-slate-400" />
              <span className="truncate">{profile?.email ?? '—'}</span>
            </div>
            {profile?.phone && (
              <div className="flex items-center gap-2 text-slate-600 dark:text-zinc-400">
                <span className="text-slate-400 text-xs">📞</span>
                <span>{profile.phone}</span>
              </div>
            )}
            {form.working_days.length > 0 && (
              <div className="flex items-start gap-2 text-slate-600 dark:text-zinc-400 pt-1 border-t border-slate-100 dark:border-zinc-800">
                <Clock size={14} className="text-slate-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500 dark:text-zinc-500">
                    {form.working_days.map(d => d[0].toUpperCase() + d.slice(1, 3)).join(', ')}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-500">{form.start_time} – {form.end_time}</div>
                </div>
              </div>
            )}
            {profile?.clinic_name && (
              <div className="flex items-start gap-2 text-slate-600 dark:text-zinc-400 pt-1 border-t border-slate-100 dark:border-zinc-800">
                <Building2 size={14} className="text-slate-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-slate-700 dark:text-zinc-300 truncate">{profile.clinic_name}</div>
                  {profile.clinic_address && <div className="text-[11px] text-slate-500 dark:text-zinc-500">{profile.clinic_address}</div>}
                  {profile.clinic_phone   && <div className="text-[11px] text-slate-500 dark:text-zinc-500">{profile.clinic_phone}</div>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Edit form ── */}
        <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-6">
          <h3 className="font-bold text-slate-900 dark:text-white mb-1">Personal information</h3>
          <p className="text-sm text-slate-500 dark:text-zinc-500 mb-5">These are the details others will see.</p>

          {error && (
            <div className="rounded-lg border-l-[3px] border-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-3 flex items-start gap-2.5 text-sm text-red-700 dark:text-red-400 mb-4">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={onSave} className="space-y-1">
            <Field label="Full name" required>
              <Input value={form.full_name} onChange={update('full_name')} placeholder="John Smith" disabled={saving} />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Email" hint="Email is fixed once created.">
                <Input value={profile?.email ?? ''} readOnly disabled className="opacity-60 cursor-not-allowed" />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={update('phone')} placeholder="+961 70 000 000" disabled={saving} />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Gender">
                <Select value={form.gender} onChange={update('gender')} disabled={saving}>
                  <option value="">Not set</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </Select>
              </Field>
              <Field label="Date of birth">
                <Input type="date" value={form.date_of_birth} onChange={update('date_of_birth')} disabled={saving} />
              </Field>
            </div>

            <Field label="Specialty" hint="Set at registration — contact admin to change this.">
              <Input value={form.specialty} disabled className="opacity-60 cursor-not-allowed capitalize" />
            </Field>

            <Field label="Short bio">
              <Textarea
                value={form.bio}
                onChange={update('bio')}
                placeholder="A short professional summary…"
                rows={4}
                disabled={saving}
              />
            </Field>

            <hr className="my-5 border-slate-200 dark:border-zinc-800" />

            <div className="mb-3">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 size={16} className="text-slate-400" /> Clinic information
              </h4>
              <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">Used as the default location on new appointments.</p>
            </div>

            <Field label="Clinic name">
              <Input value={form.clinic_name} onChange={update('clinic_name')} placeholder="e.g. NurtureX Pediatric Clinic" disabled={saving} />
            </Field>

            <Field label="Clinic address">
              <Input value={form.clinic_address} onChange={update('clinic_address')} placeholder="Street, city, country" disabled={saving} />
            </Field>

            <Field label="Clinic phone">
              <Input value={form.clinic_phone} onChange={update('clinic_phone')} placeholder="+961 70 000 000" disabled={saving} />
            </Field>

            <hr className="my-5 border-slate-200 dark:border-zinc-800" />

            <div className="mb-3">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock size={16} className="text-slate-400" /> Working hours
              </h4>
              <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">
                Drives the time slots parents (and you) can book appointments in.
              </p>
            </div>

            <Field label="Working days">
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => {
                  const active = form.working_days.includes(d.value)
                  return (
                    <button
                      key={d.value}
                      type="button"
                      disabled={saving}
                      onClick={() => toggleDay(d.value)}
                      className={
                        'w-12 h-10 rounded-lg text-xs font-semibold border-2 transition-colors ' +
                        (active ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300' : 'border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:border-brand-300')
                      }
                    >
                      {d.label}
                    </button>
                  )
                })}
              </div>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="From">
                <Input type="time" value={form.start_time} onChange={update('start_time')} disabled={saving} />
              </Field>
              <Field label="To">
                <Input type="time" value={form.end_time} onChange={update('end_time')} disabled={saving} />
              </Field>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button type="submit" loading={saving}>
                <Save size={14} /> Save changes
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
