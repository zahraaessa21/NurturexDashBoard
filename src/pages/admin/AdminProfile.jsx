// src/pages/admin/AdminProfile.jsx
//
// Admin edits their own general profile: name, phone, avatar, and password.
// Email and role are read-only.

import { useState } from 'react'
import { Save, Mail, ShieldCheck, AlertCircle, Lock, Eye, EyeOff } from 'lucide-react'

import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { profileService } from '../../services/profileService'
import { storageService }  from '../../services/storageService'
import { supabase } from '../../supabaseClient'

import Button from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'
import ImageUpload from '../../components/ui/ImageUpload'
import StatusBadge from '../../components/StatusBadge'

export default function AdminProfile() {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()

  const [form, setForm] = useState({
    full_name: profile?.full_name ?? '',
    phone:     profile?.phone ?? '',
  })
  const [avatarFile,   setAvatarFile]   = useState(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // Password change
  const [pwd, setPwd] = useState({ next: '', confirm: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdError,  setPwdError]  = useState('')

  const update = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const onSave = async (e) => {
    e.preventDefault()
    if (saving || !profile?.id) return
    setSaving(true); setError('')
    try {
      const patch = {
        full_name: form.full_name.trim(),
        phone:     form.phone.trim() || null,
      }

      if (avatarFile) {
        try {
          const url = await storageService.uploadAvatar(profile.id, avatarFile)
          patch.avatar_url = url
          if (profile.avatar_url) await storageService.deleteByUrl(profile.avatar_url)
        } catch (err) {
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

  const onChangePassword = async (e) => {
    e.preventDefault()
    setPwdError('')
    if (pwd.next.length < 8) return setPwdError('Password must be at least 8 characters.')
    if (pwd.next !== pwd.confirm) return setPwdError('Passwords do not match.')

    setPwdSaving(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pwd.next })
      if (err) throw err
      setPwd({ next: '', confirm: '' })
      toast.success('Password updated')
    } catch (err) {
      const msg = err.message ?? 'Could not update password'
      setPwdError(msg)
      toast.error(msg)
    } finally {
      setPwdSaving(false)
    }
  }

  return (
    <>
      <div className="mb-7">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Edit profile</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-500 mt-1">Update your profile info, avatar, and password.</p>
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
              {form.full_name || 'Unnamed'}
            </h2>
            <div className="mt-3 flex items-center justify-center gap-2">
              <StatusBadge status={profile?.status ?? 'active'} />
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 capitalize">
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
          </div>
        </div>

        {/* ── Edit form ── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-6">
            <h3 className="font-bold text-slate-900 dark:text-white mb-1">General information</h3>
            <p className="text-sm text-slate-500 dark:text-zinc-500 mb-5">These are your account details.</p>

            {error && (
              <div className="rounded-lg border-l-[3px] border-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-3 flex items-start gap-2.5 text-sm text-red-700 dark:text-red-400 mb-4">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={onSave} className="space-y-1">
              <Field label="Full name" required>
                <Input value={form.full_name} onChange={update('full_name')} placeholder="Jane Doe" disabled={saving} />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Email" hint="Email is fixed once created.">
                  <Input value={profile?.email ?? ''} readOnly disabled className="opacity-60 cursor-not-allowed" />
                </Field>
                <Field label="Phone">
                  <Input value={form.phone} onChange={update('phone')} placeholder="+961 70 000 000" disabled={saving} />
                </Field>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button type="submit" loading={saving}>
                  <Save size={14} /> Save changes
                </Button>
              </div>
            </form>
          </div>

          {/* ── Change password ── */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-6">
            <h3 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Lock size={16} className="text-slate-400" /> Change password
            </h3>
            <p className="text-sm text-slate-500 dark:text-zinc-500 mb-5">Set a new password for your account.</p>

            {pwdError && (
              <div className="rounded-lg border-l-[3px] border-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-3 flex items-start gap-2.5 text-sm text-red-700 dark:text-red-400 mb-4">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{pwdError}</span>
              </div>
            )}

            <form onSubmit={onChangePassword} className="space-y-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="New password" required hint="Min. 8 characters">
                  <div className="relative">
                    <Input
                      type={showPwd ? 'text' : 'password'}
                      value={pwd.next}
                      onChange={(e) => setPwd(p => ({ ...p, next: e.target.value }))}
                      disabled={pwdSaving}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>
                <Field label="Confirm new password" required>
                  <Input
                    type={showPwd ? 'text' : 'password'}
                    value={pwd.confirm}
                    onChange={(e) => setPwd(p => ({ ...p, confirm: e.target.value }))}
                    disabled={pwdSaving}
                  />
                </Field>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button type="submit" loading={pwdSaving} variant="secondary">
                  <Lock size={14} /> Update password
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
