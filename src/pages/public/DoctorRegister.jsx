// src/pages/public/DoctorRegister.jsx
//
// Public "Join as Doctor" application form. No auth required — submits a
// pending row to `doctor_applications` (+ uploads CV/license to private
// storage). An admin then approves/rejects from /admin/doctor-applications.

import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Upload, FileText, X, CheckCircle2,
  Eye, EyeOff, Loader2, ShieldCheck, Stethoscope, Baby as BabyIcon,
  MapPin, Clock,
} from 'lucide-react'
import Logo from '../../components/Logo'
import Button from '../../components/ui/Button'
import { Field, Input, Select } from '../../components/ui/Field'
import { useToast } from '../../hooks/useToast'
import { doctorApplicationService, validateApplication } from '../../services/doctorApplicationService'

const STEPS = ['Personal Info', 'Professional Info', 'Review & Submit']

const DAYS = [
  { value: 'monday',    label: 'Mon' },
  { value: 'tuesday',   label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday',  label: 'Thu' },
  { value: 'friday',    label: 'Fri' },
  { value: 'saturday',  label: 'Sat' },
  { value: 'sunday',    label: 'Sun' },
]

const EMPTY_FORM = {
  fullName: '', email: '', phone: '', password: '', confirmPassword: '',
  gender: '', dateOfBirth: '', specialty: '',
  clinicName: '', clinicAddress: '', clinicPhone: '',
  workingDays: [], startTime: '09:00', endTime: '17:00',
  cvFile: null, licenseFile: null,
}

const PROGRESS_LABEL = {
  cv:      'Uploading CV…',
  license: 'Uploading medical license…',
  saving:  'Submitting application…',
}

function FileDropField({ label, hint, file, onChange, error, accept, disabled }) {
  const inputRef = useRef(null)
  return (
    <Field label={label} required error={error} hint={hint}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {!file ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed border-slate-200 hover:border-brand-400 hover:bg-brand-50/40 transition-colors text-slate-500"
        >
          <Upload size={20} />
          <span className="text-sm font-medium">Click to upload</span>
        </button>
      ) : (
        <div className="flex items-center justify-between gap-3 h-32 rounded-xl border border-slate-200 bg-slate-50 px-4">
          <div className="flex items-center gap-3 min-w-0">
            <FileText size={22} className="text-brand-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate max-w-[220px]">{file.name}</p>
              <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>
          <button type="button" disabled={disabled} onClick={() => onChange(null)} className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500">
            <X size={16} />
          </button>
        </div>
      )}
    </Field>
  )
}

export default function DoctorRegister() {
  const navigate = useNavigate()
  const toast = useToast()

  const [step, setStep] = useState(0)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [showPwd, setShowPwd] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [progressStage, setProgressStage] = useState(null)
  const [done, setDone] = useState(false)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const validateStep = (s) => {
    const all = validateApplication(form)
    const fieldsByStep = [
      ['fullName', 'email', 'phone', 'gender', 'dateOfBirth', 'password', 'confirmPassword'],
      ['specialty', 'clinicName', 'clinicAddress', 'workingDays', 'startTime', 'endTime', 'cvFile', 'licenseFile'],
      [],
    ]
    const stepErrors = {}
    for (const key of fieldsByStep[s]) if (all[key]) stepErrors[key] = all[key]
    setErrors((prev) => ({ ...prev, ...stepErrors, ...Object.fromEntries(fieldsByStep[s].filter(k => !all[k]).map(k => [k, undefined])) }))
    return Object.keys(stepErrors).length === 0
  }

  const next = async () => {
    if (!validateStep(step)) {
      toast.error('Please fix the highlighted fields.')
      return
    }
    if (step === 0) {
      try {
        const available = await doctorApplicationService.checkEmailAvailable(form.email)
        if (!available) {
          setErrors((e) => ({ ...e, email: 'This email is already registered or has a pending application.' }))
          toast.error('This email is already in use.')
          return
        }
      } catch {
        // Non-fatal — the DB unique constraint / signUp will still catch it at submit time.
      }
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  const back = () => setStep((s) => Math.max(0, s - 1))

  const submit = async () => {
    const all = validateApplication(form)
    if (Object.keys(all).length > 0) {
      setErrors(all)
      toast.error('Please fix the highlighted fields before submitting.')
      setStep(all.specialty || all.clinicName || all.clinicAddress || all.workingDays || all.startTime || all.endTime || all.cvFile || all.licenseFile ? 1 : 0)
      return
    }
    setSubmitting(true)
    try {
      await doctorApplicationService.submitApplication(form, setProgressStage)
      setDone(true)
      toast.success('Application submitted!')
    } catch (err) {
      toast.error(err.message ?? 'Could not submit your application.')
    } finally {
      setSubmitting(false)
      setProgressStage(null)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 grid place-items-center px-5">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-100 shadow-card p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 grid place-items-center mx-auto mb-4">
            <CheckCircle2 size={30} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Application Submitted</h1>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            Thanks, Dr. {form.fullName.split(' ')[0]}. Your application is now <strong>pending review</strong>.
            We'll email <strong>{form.email}</strong> with your decision — if approved, that email will include your login credentials.
          </p>
          <Button className="mt-6" onClick={() => navigate('/')}>
            <ArrowLeft size={16} className="mr-1.5" /> Back to Home
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="h-16 flex items-center px-5 sm:px-8 border-b border-slate-100 bg-white">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="mx-auto"><Logo size={28} withWordmark wordmarkClass="text-sm" /></div>
        <div className="w-12" />
      </header>

      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-10">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-700 grid place-items-center mx-auto mb-3">
            <Stethoscope size={26} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Join NurtureX as a Doctor</h1>
          <p className="mt-1.5 text-sm text-slate-500">Apply to join our verified network of Obstetricians and Pediatricians.</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={
                'w-8 h-8 rounded-full grid place-items-center text-xs font-bold ' +
                (i < step ? 'bg-brand-700 text-white' : i === step ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-700' : 'bg-slate-100 text-slate-400')
              }>
                {i < step ? <CheckCircle2 size={16} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={'w-8 sm:w-16 h-0.5 ' + (i < step ? 'bg-brand-700' : 'bg-slate-200')} />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-soft p-6 sm:p-8">
          {/* Step 0 — Personal Info */}
          {step === 0 && (
            <div className="space-y-1">
              <Field label="Full Name" required error={errors.fullName}>
                <Input value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} placeholder="Dr. Jane Doe" disabled={submitting} />
              </Field>
              <Field label="Email" required error={errors.email}>
                <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@example.com" disabled={submitting} />
              </Field>
              <Field label="Phone Number" required error={errors.phone}>
                <Input type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+961 70 000 000" disabled={submitting} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Gender" required error={errors.gender}>
                  <Select value={form.gender} onChange={(e) => set({ gender: e.target.value })} disabled={submitting}>
                    <option value="">Select</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </Select>
                </Field>
                <Field label="Date of Birth" required error={errors.dateOfBirth}>
                  <Input type="date" value={form.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} disabled={submitting} />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Password" required error={errors.password} hint="Min. 8 chars, upper + lower case, a number">
                  <div className="relative">
                    <Input type={showPwd ? 'text' : 'password'} value={form.password} onChange={(e) => set({ password: e.target.value })} disabled={submitting} className="pr-10" />
                    <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>
                <Field label="Confirm Password" required error={errors.confirmPassword}>
                  <Input type={showPwd ? 'text' : 'password'} value={form.confirmPassword} onChange={(e) => set({ confirmPassword: e.target.value })} disabled={submitting} />
                </Field>
              </div>
            </div>
          )}

          {/* Step 1 — Professional Info */}
          {step === 1 && (
            <div className="space-y-1">
              <Field label="Medical Specialty" required error={errors.specialty}>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'obstetrics', label: 'Obstetrics', icon: ShieldCheck },
                    { value: 'pediatrics', label: 'Pediatrics (Baby Specialist)', icon: BabyIcon },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={submitting}
                      onClick={() => set({ specialty: opt.value })}
                      className={
                        'flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-colors ' +
                        (form.specialty === opt.value ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:border-brand-300')
                      }
                    >
                      <opt.icon size={20} />
                      <span className="text-xs font-semibold">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Clinic Name" required error={errors.clinicName}>
                  <Input value={form.clinicName} onChange={(e) => set({ clinicName: e.target.value })} placeholder="Sunrise Pediatric Clinic" disabled={submitting} />
                </Field>
                <Field label="Clinic Phone" hint="Optional, if different from above">
                  <Input type="tel" value={form.clinicPhone} onChange={(e) => set({ clinicPhone: e.target.value })} placeholder="+961 7 000000" disabled={submitting} />
                </Field>
              </div>
              <Field label="Clinic Location" required error={errors.clinicAddress}>
                <div className="relative">
                  <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input value={form.clinicAddress} onChange={(e) => set({ clinicAddress: e.target.value })} placeholder="Street, building, city" disabled={submitting} className="pl-9" />
                </div>
              </Field>

              <Field label="Working Days" required error={errors.workingDays}>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => {
                    const active = form.workingDays.includes(d.value)
                    return (
                      <button
                        key={d.value}
                        type="button"
                        disabled={submitting}
                        onClick={() => set({
                          workingDays: active
                            ? form.workingDays.filter((x) => x !== d.value)
                            : [...form.workingDays, d.value],
                        })}
                        className={
                          'w-12 h-10 rounded-lg text-xs font-semibold border-2 transition-colors ' +
                          (active ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-500 hover:border-brand-300')
                        }
                      >
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Working Hours — From" required error={errors.startTime}>
                  <div className="relative">
                    <Clock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input type="time" value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} disabled={submitting} className="pl-9" />
                  </div>
                </Field>
                <Field label="Working Hours — To" required error={errors.endTime}>
                  <div className="relative">
                    <Clock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input type="time" value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} disabled={submitting} className="pl-9" />
                  </div>
                </Field>
              </div>

              <FileDropField
                label="Curriculum Vitae (CV)"
                hint="PDF only, max 5 MB"
                accept="application/pdf"
                file={form.cvFile}
                error={errors.cvFile}
                disabled={submitting}
                onChange={(f) => set({ cvFile: f })}
              />

              <FileDropField
                label="Medical License (License to Practice / إذن مزاولة المهنة)"
                hint="PDF, PNG, or JPG, max 5 MB"
                accept="application/pdf,image/png,image/jpeg"
                file={form.licenseFile}
                error={errors.licenseFile}
                disabled={submitting}
                onChange={(f) => set({ licenseFile: f })}
              />
            </div>
          )}

          {/* Step 2 — Review */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-5 space-y-3 text-sm">
                {[
                  ['Full name', form.fullName],
                  ['Email', form.email],
                  ['Phone', form.phone],
                  ['Gender', form.gender],
                  ['Date of birth', form.dateOfBirth],
                  ['Specialty', form.specialty === 'obstetrics' ? 'Obstetrics' : 'Pediatrics (Baby Specialist)'],
                  ['Clinic name', form.clinicName],
                  ['Clinic location', form.clinicAddress],
                  ['Working days', form.workingDays.map((d) => d[0].toUpperCase() + d.slice(1)).join(', ')],
                  ['Working hours', `${form.startTime} – ${form.endTime}`],
                  ['CV', form.cvFile?.name],
                  ['Medical license', form.licenseFile?.name],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-medium text-slate-800 truncate max-w-[220px] text-right">{value || '—'}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                By submitting, you confirm the information above is accurate. Your application will be reviewed by our admin team —
                you'll receive an email once a decision is made. You won't be able to sign in until then.
              </p>

              {submitting && (
                <div className="flex items-center gap-2.5 text-sm text-brand-700 bg-brand-50 rounded-lg px-4 py-3">
                  <Loader2 size={16} className="animate-spin" />
                  {PROGRESS_LABEL[progressStage] || 'Submitting…'}
                </div>
              )}
            </div>
          )}

          {/* Nav buttons */}
          <div className="mt-8 flex items-center justify-between gap-3">
            <Button variant="secondary" onClick={back} disabled={step === 0 || submitting}>
              <ArrowLeft size={16} className="mr-1" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next} disabled={submitting}>
                Continue <ArrowRight size={16} className="ml-1" />
              </Button>
            ) : (
              <Button onClick={submit} loading={submitting}>
                Submit Application
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
