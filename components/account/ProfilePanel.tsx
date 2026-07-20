'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { parsePublicObjectPath } from '@/lib/storage/media-url'
import { UserIcon } from '@/components/brand/icons'
import { AccountAvatar } from './AccountAvatar'
import type { AccountProfile } from './types'

const CARD =
  'rounded-[20px] border border-[#EEEAF3] bg-white p-[26px] shadow-[0_22px_44px_-36px_rgba(90,60,160,0.4)]'
const AVATAR_BUCKET = 'avatars'
const MAX_AVATAR_BYTES = 2 * 1024 * 1024 // 2MB

// STORE-001: xoá object avatar CŨ khi thay/gỡ (compensated-delete). Best-effort — lỗi bỏ qua (orphan job
//   server-side dọn nốt). URL cũ trùng URL mới (không đổi thật) → bỏ qua. RLS avatars_owner_delete cho phép.
async function removeStorageObject(
  supabase: ReturnType<typeof createClient>,
  oldUrl: string | null | undefined,
  newUrl: string | null,
): Promise<void> {
  if (!oldUrl || oldUrl === newUrl) return
  const obj = parsePublicObjectPath(oldUrl)
  if (!obj) return
  try { await supabase.storage.from(obj.bucket).remove([obj.path]) } catch { /* orphan job dọn nốt */ }
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'
const shortId = (id: string) => (id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id)

export function ProfilePanel({ profile }: { profile: AccountProfile }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(profile.name ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const dirty = name.trim() !== (profile.name ?? '').trim()

  async function saveName() {
    setMsg(null)
    setBusy(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('profiles').update({ name: name.trim() || null }).eq('id', profile.id)
      if (error) throw error
      setMsg({ tone: 'ok', text: 'Đã lưu tên hiển thị.' })
      router.refresh()
    } catch {
      setMsg({ tone: 'err', text: 'Không lưu được. Vui lòng thử lại.' })
    } finally {
      setBusy(false)
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return setMsg({ tone: 'err', text: 'Vui lòng chọn tệp ảnh.' })
    if (file.size > MAX_AVATAR_BYTES) return setMsg({ tone: 'err', text: 'Ảnh tối đa 2MB.' })
    setMsg(null)
    setBusy(true)
    try {
      const supabase = createClient()
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${profile.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type,
      })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
      const oldAvatar = profile.avatar
      const { error: updErr } = await supabase.from('profiles').update({ avatar: pub.publicUrl }).eq('id', profile.id)
      if (updErr) throw updErr
      // STORE-001: xoá avatar CŨ sau khi commit ref mới (compensated-delete; best-effort — orphan job dọn nốt).
      await removeStorageObject(supabase, oldAvatar, pub.publicUrl)
      setMsg({ tone: 'ok', text: 'Đã cập nhật ảnh đại diện.' })
      router.refresh()
    } catch {
      setMsg({ tone: 'err', text: 'Chưa tải được ảnh (kho lưu trữ chưa sẵn sàng). Thử lại sau.' })
    } finally {
      setBusy(false)
    }
  }

  async function removeAvatar() {
    if (!profile.avatar) return
    setMsg(null)
    setBusy(true)
    try {
      const supabase = createClient()
      const oldAvatar = profile.avatar
      const { error } = await supabase.from('profiles').update({ avatar: null }).eq('id', profile.id)
      if (error) throw error
      // STORE-001: gỡ avatar → xoá object cũ (compensated-delete; best-effort).
      await removeStorageObject(supabase, oldAvatar, null)
      setMsg({ tone: 'ok', text: 'Đã gỡ ảnh đại diện.' })
      router.refresh()
    } catch {
      setMsg({ tone: 'err', text: 'Không gỡ được ảnh. Vui lòng thử lại.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Profile card */}
      <section className={CARD}>
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-extrabold tracking-[-0.01em] text-[#2A2740]">Hồ sơ</h2>
          <span className="rounded-full bg-[#E7F7EE] px-[11px] py-[5px] text-[12.5px] font-bold text-[var(--text-success)]">
            Có thể sửa
          </span>
        </div>

        <div className="mt-5 flex items-center gap-[18px]">
          <AccountAvatar name={profile.name} email={profile.email} avatar={profile.avatar} />
          <div className="flex flex-wrap gap-2.5">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[11px] bg-[#7C5CE6] px-4 py-2.5 text-[13.5px] font-bold text-white shadow-[0_10px_22px_-8px_rgba(124,92,230,0.55)] transition hover:bg-[#6A48D6] disabled:opacity-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4" />
                <path d="M7 9l5-5 5 5" />
                <path d="M4 20h16" />
              </svg>
              Tải ảnh lên
            </button>
            <button
              type="button"
              disabled={busy || !profile.avatar}
              onClick={removeAvatar}
              className="inline-flex min-h-[44px] items-center rounded-[11px] border border-[#E8E2F0] bg-white px-4 py-2.5 text-[13.5px] font-bold text-[#564F6B] transition hover:border-[#CCC3DC] disabled:opacity-40"
            >
              Gỡ ảnh
            </button>
          </div>
        </div>

        <div className="mt-5 max-w-[420px]">
          <label htmlFor="acct-name" className="mb-[7px] block text-[13px] font-bold text-[#4A445E]">
            Tên hiển thị
          </label>
          <div className="flex items-center gap-2.5 rounded-[12px] border border-[#E8E2F0] bg-white px-3.5 shadow-[0_4px_12px_rgba(42,39,64,0.04)] focus-within:border-[#7C5CE6]">
            <span className="flex flex-none text-[var(--text-placeholder)]">
              <UserIcon />
            </span>
            <input
              id="acct-name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên của bạn"
              className="min-w-0 flex-1 border-none bg-transparent py-3 text-[14.5px] text-[#2A2740] outline-none placeholder:text-[var(--text-placeholder)]"
            />
          </div>
          <div className="mt-4 flex gap-2.5">
            <button
              type="button"
              disabled={busy || !dirty}
              onClick={saveName}
              className="rounded-[12px] bg-[#7C5CE6] px-5 py-2.5 text-[14px] font-bold text-white shadow-[0_12px_24px_-8px_rgba(124,92,230,0.55)] transition hover:bg-[#6A48D6] disabled:opacity-50"
            >
              Lưu thay đổi
            </button>
            <button
              type="button"
              disabled={busy || !dirty}
              onClick={() => {
                setName(profile.name ?? '')
                setMsg(null)
              }}
              className="rounded-[12px] border border-[#E8E2F0] bg-white px-5 py-2.5 text-[14px] font-bold text-[#564F6B] transition hover:border-[#CCC3DC] disabled:opacity-40"
            >
              Hủy
            </button>
          </div>
          {msg && (
            <p className={`mt-3 text-[13px] font-bold ${msg.tone === 'ok' ? 'text-[var(--text-success)]' : 'text-[#D24A4A]'}`}>
              {msg.text}
            </p>
          )}
        </div>
      </section>

      {/* Account info card */}
      <section className={CARD}>
        <h2 className="text-[18px] font-extrabold tracking-[-0.01em] text-[#2A2740]">Thông tin tài khoản</h2>
        <div className="mt-[18px] grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <InfoTile label="Email">
            <span className="flex items-center gap-2">
              <span className="truncate">{profile.email ?? '—'}</span>
              {profile.emailVerified && (
                <span className="rounded-[6px] bg-[#E7F7EE] px-[7px] py-0.5 text-[11px] font-extrabold text-[var(--text-success)]">
                  Đã xác minh
                </span>
              )}
            </span>
          </InfoTile>
          <InfoTile label="Thành viên từ">{fmtDate(profile.createdAt)}</InfoTile>
          <InfoTile label="Gói sở hữu">
            {profile.ownedPacks} gói · {profile.ownedTests} đề
          </InfoTile>
          <InfoTile label="Mã tài khoản">{shortId(profile.id)}</InfoTile>
        </div>
      </section>
    </>
  )
}

function InfoTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-[#F1EDF7] bg-[#FBFAFD] px-[17px] py-[15px]">
      <div className="text-[12px] font-bold text-[var(--text-subtle)]">{label}</div>
      <div className="mt-[5px] text-[14.5px] font-bold text-[#2A2740]">{children}</div>
    </div>
  )
}
