'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// W17 — Sổ từ vựng (M09). CRUD own-only qua /api/vocab (RLS enforce). Export CSV = /api/vocab/export (cookie same-origin).
//   Chống double-submit (disable khi saving). Sau mutate → fetch lại từ server (KHÔNG tự sửa state suy đoán).
type VocabItem = { id: string; word: string; definition: string | null; example: string | null; created_at: string }

export default function VocabPage() {
  const [items, setItems] = useState<VocabItem[]>([])
  const [state, setState] = useState<'loading' | 'ok' | 'unauth' | 'error'>('loading')
  const [word, setWord] = useState('')
  const [definition, setDefinition] = useState('')
  const [example, setExample] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/vocab')
      if (res.status === 401) return setState('unauth')
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.data) return setState('error')
      setItems((body.data.items ?? []) as VocabItem[])
      setState('ok')
    } catch {
      setState('error')
    }
  }
  useEffect(() => { load() }, [])

  async function addWord(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return // chống double-submit
    const w = word.trim()
    if (!w) { setErr('Nhập từ cần thêm.'); return }
    setErr(null)
    setSaving(true)
    try {
      const res = await fetch('/api/vocab', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ word: w, definition: definition.trim(), example: example.trim() }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setErr(body?.message ?? 'Không lưu được từ.'); return }
      setWord(''); setDefinition(''); setExample('')
      await load() // fetch lại từ server
    } catch {
      setErr('Lỗi mạng, vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (deletingId) return // FE-F09: chống double-click xóa (đồng bộ với guard `saving` của form thêm)
    setDeletingId(id)
    try {
      const res = await fetch('/api/vocab', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) await load()
    } catch { /* ignore */ } finally {
      setDeletingId(null)
    }
  }

  if (state === 'loading') return <p className="text-[14px] text-[var(--text-muted)]">Đang tải…</p>
  if (state === 'unauth')
    return (
      <p className="text-[14px] text-[var(--text-muted)]">
        Bạn cần <Link href="/login?next=/dashboard/vocab" className="font-bold text-[#6A48D6] underline">đăng nhập</Link> để dùng sổ từ vựng.
      </p>
    )
  if (state === 'error')
    return (
      <p role="alert" className="text-[14px] text-rose-600">
        Không tải được sổ từ vựng —{' '}
        <button type="button" onClick={() => { setState('loading'); void load() }} className="font-bold underline">thử lại</button>.
      </p>
    )

  return (
    <div>
      {/* Add form */}
      <form onSubmit={addWord} className="rounded-[16px] border border-[#EEEAF3] bg-[#FBFAFF] px-5 py-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="Từ mới *"
            maxLength={100}
            className="rounded-[12px] border border-[#E4DEEE] bg-white px-3.5 py-2.5 text-[14px] font-semibold outline-none focus:border-[#7C5CE6]"
          />
          <input
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            placeholder="Định nghĩa"
            maxLength={2000}
            className="rounded-[12px] border border-[#E4DEEE] bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-[#7C5CE6]"
          />
          <input
            value={example}
            onChange={(e) => setExample(e.target.value)}
            placeholder="Ví dụ"
            maxLength={2000}
            className="rounded-[12px] border border-[#E4DEEE] bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-[#7C5CE6]"
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !word.trim()}
            className={`rounded-[12px] px-4 py-2.5 text-[14px] font-bold text-white transition ${
              saving || !word.trim() ? 'cursor-not-allowed bg-[#D8D2E4]' : 'bg-[#7C5CE6] hover:bg-[#6A48D6]'
            }`}
          >
            {saving ? 'Đang lưu…' : '+ Thêm từ'}
          </button>
          <a
            href="/api/vocab/export"
            className="rounded-[12px] border border-[#E8E2F0] bg-white px-4 py-2.5 text-[14px] font-bold text-[#5B43C7] hover:border-[#CCC3DC]"
          >
            ⬇ Xuất CSV
          </a>
          {err && <span className="text-[13px] font-semibold text-rose-600">{err}</span>}
        </div>
      </form>

      {/* List */}
      <div className="mt-6">
        <div className="text-[13px] font-bold text-[var(--text-muted)]">{items.length} từ</div>
        {items.length === 0 ? (
          <p className="mt-3 text-[14px] text-[var(--text-muted)]">Chưa có từ nào. Thêm từ đầu tiên phía trên.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#F1EEF7] rounded-[16px] border border-[#EEEAF3] bg-white">
            {items.map((v) => (
              <li key={v.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="text-[15px] font-extrabold text-[#2A2740]">{v.word}</div>
                  {v.definition && <div className="mt-0.5 text-[13.5px] text-[#5C5670]">{v.definition}</div>}
                  {v.example && <div className="mt-0.5 text-[13px] italic text-[var(--text-subtle)]">“{v.example}”</div>}
                </div>
                <button
                  type="button"
                  onClick={() => remove(v.id)}
                  disabled={deletingId !== null}
                  className="flex-none rounded-[10px] border border-[#F0DDE4] px-3 py-1.5 text-[13px] font-bold text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deletingId === v.id ? 'Đang xóa…' : 'Xóa'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
