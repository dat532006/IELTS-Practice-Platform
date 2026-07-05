'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LockIcon } from '@/components/brand/icons'
import { PasswordField } from '@/components/auth/fields'
import { StrengthMeter } from '@/components/auth/StrengthMeter'
import { passwordLevel, WEAK_PASSWORD_ERROR } from '@/lib/auth/password'

const CARD =
  'rounded-[20px] border border-[#EEEAF3] bg-white p-[26px] shadow-[0_22px_44px_-36px_rgba(90,60,160,0.4)]'

// Đổi mật khẩu khi đang đăng nhập. Xác minh mật khẩu hiện tại bằng signInWithPassword (re-auth),
// rồi updateUser({ password }). Cả hai chạy qua browser client (anon) — server không thấy mật khẩu.
export function SecurityPanel({ email }: { email: string | null }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const level = passwordLevel(next)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (!email) return setMsg({ tone: 'err', text: 'Không xác định được email tài khoản.' })
    if (!current) return setMsg({ tone: 'err', text: 'Nhập mật khẩu hiện tại.' })
    if (level < 1) return setMsg({ tone: 'err', text: WEAK_PASSWORD_ERROR })
    if (next === current) return setMsg({ tone: 'err', text: 'Mật khẩu mới phải khác mật khẩu hiện tại.' })

    setBusy(true)
    try {
      const supabase = createClient()
      const { error: reauth } = await supabase.auth.signInWithPassword({ email, password: current })
      if (reauth) {
        setMsg({ tone: 'err', text: 'Mật khẩu hiện tại không đúng.' })
        return
      }
      const { error: updErr } = await supabase.auth.updateUser({ password: next })
      if (updErr) {
        setMsg({ tone: 'err', text: updErr.message || 'Không đổi được mật khẩu.' })
        return
      }
      setCurrent('')
      setNext('')
      setMsg({ tone: 'ok', text: 'Đã cập nhật mật khẩu.' })
    } catch {
      setMsg({ tone: 'err', text: 'Lỗi mạng, vui lòng thử lại.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={CARD}>
      <h2 className="text-[18px] font-extrabold tracking-[-0.01em] text-[#2A2740]">Đổi mật khẩu</h2>
      <p className="mt-1.5 text-[13.5px] font-semibold text-[#857F96]">
        Bạn đang đăng nhập — nhập mật khẩu hiện tại để đặt mật khẩu mới.
      </p>

      <form onSubmit={submit} className="mt-[18px] flex max-w-[420px] flex-col gap-3.5">
        <PasswordField
          label="Mật khẩu hiện tại"
          icon={<LockIcon />}
          value={current}
          autoComplete="current-password"
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="••••••••"
        />
        <div>
          <PasswordField
            label="Mật khẩu mới"
            icon={<LockIcon />}
            value={next}
            autoComplete="new-password"
            onChange={(e) => setNext(e.target.value)}
            placeholder="••••••••"
          />
          <StrengthMeter level={level} />
        </div>

        {msg && (
          <p className={`text-[13px] font-bold ${msg.tone === 'ok' ? 'text-[#1E9E63]' : 'text-[#D24A4A]'}`}>
            {msg.text}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-[12px] bg-[#7C5CE6] px-5 py-2.5 text-[14px] font-bold text-white shadow-[0_12px_24px_-8px_rgba(124,92,230,0.55)] transition hover:bg-[#6A48D6] disabled:opacity-50"
        >
          {busy ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
        </button>
      </form>
    </section>
  )
}
