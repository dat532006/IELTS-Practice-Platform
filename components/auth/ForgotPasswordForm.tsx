'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Recovery dùng PKCE: phải qua /auth/callback để exchangeCodeForSession trước,
      // rồi mới tới /reset-password (lúc này đã có recovery session để updateUser).
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div>
        <h1 className="text-lg font-bold">Đã gửi liên kết</h1>
        <p className="mt-3 text-sm text-slate-600">
          Nếu email tồn tại, bạn sẽ nhận liên kết đặt lại mật khẩu.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm text-teal-700 hover:underline">
          Về đăng nhập
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-lg font-bold">Quên mật khẩu</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block text-sm">
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {loading ? 'Đang gửi...' : 'Gửi liên kết'}
        </button>
      </form>
      <Link href="/login" className="mt-4 inline-block text-xs text-slate-500 hover:text-teal-700">
        Về đăng nhập
      </Link>
    </div>
  )
}
