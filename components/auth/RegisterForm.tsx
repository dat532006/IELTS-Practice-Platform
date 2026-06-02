'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600'

export function RegisterForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div>
        <h1 className="text-lg font-bold">Kiểm tra email</h1>
        <p className="mt-3 text-sm text-slate-600">
          Đã gửi liên kết xác nhận tới <span className="font-medium">{email}</span>. Mở email để
          kích hoạt tài khoản.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm text-teal-700 hover:underline">
          Về đăng nhập
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-lg font-bold">Tạo tài khoản</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block text-sm">
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm">
          Mật khẩu
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {loading ? 'Đang tạo...' : 'Đăng ký'}
        </button>
      </form>
      <Link href="/login" className="mt-4 inline-block text-xs text-slate-500 hover:text-teal-700">
        Đã có tài khoản? Đăng nhập
      </Link>
    </div>
  )
}
