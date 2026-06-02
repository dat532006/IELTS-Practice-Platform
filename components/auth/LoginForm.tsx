'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600'

// `next` đã được sanitize ở server (login page) — path nội bộ an toàn, mặc định '/'.
export function LoginForm({ next = '/' }: { next?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    router.push(next) // quay lại trang đích (vd /exam/[id]) sau khi đăng nhập
    router.refresh()
  }

  async function google() {
    const supabase = createClient()
    // Thread `next` qua callback để OAuth cũng quay lại đúng đích (callback re-sanitize).
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
  }

  return (
    <div>
      <h1 className="text-lg font-bold">Đăng nhập</h1>
      <button
        onClick={google}
        className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
      >
        Tiếp tục với Google
      </button>
      <div className="my-4 text-center text-xs text-slate-400">hoặc</div>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm">
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm">
          Mật khẩu
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
      <div className="mt-4 flex justify-between text-xs text-slate-500">
        <Link href="/forgot-password" className="hover:text-teal-700">Quên mật khẩu?</Link>
        <Link href="/register" className="hover:text-teal-700">Tạo tài khoản</Link>
      </div>
    </div>
  )
}
