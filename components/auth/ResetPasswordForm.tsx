'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600'

export function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    router.push('/login')
  }

  return (
    <div>
      <h1 className="text-lg font-bold">Đặt lại mật khẩu</h1>
      <p className="mt-1 text-xs text-slate-500">Mở trang này từ liên kết trong email.</p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block text-sm">
          Mật khẩu mới
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {loading ? 'Đang lưu...' : 'Cập nhật mật khẩu'}
        </button>
      </form>
    </div>
  )
}
