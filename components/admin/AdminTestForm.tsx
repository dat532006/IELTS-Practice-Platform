'use client'

import { useState } from 'react'
import Link from 'next/link'

// W12 — Admin test form (M11). LUẬT THÉP #2: đáp án nhập ở Ô RIÊNG → build vào answer_keys, KHÔNG vào questions.
//   Guard thật ở server (admin layout + /api/admin/* requireAdmin); form chỉ gọi API. KHÔNG import scoring/secret.
type TestType = 'reading' | 'listening' | 'writing'
type Passage = { id: string; title: string; content: string }
type QField = { id: string; number: string; type: string; prompt: string; answers: string; points: string }

const Q_TYPES = ['gap_filling', 'mcq', 'tfng', 'ynng', 'matching', 'short_answer']

function uid(p: string) {
  return p + Math.random().toString(36).slice(2, 7)
}

export function AdminTestForm() {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<TestType>('reading')
  const [slug, setSlug] = useState('')
  const [isFree, setIsFree] = useState(true)
  const [durationMin, setDurationMin] = useState('60')
  const [passages, setPassages] = useState<Passage[]>([{ id: 'p1', title: 'Passage 1', content: '' }])
  const [questions, setQuestions] = useState<QField[]>([
    { id: 'q1', number: '1', type: 'gap_filling', prompt: '', answers: '', points: '1' },
  ])

  const [phase, setPhase] = useState<'idle' | 'submitting'>('idle')
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ test_id: string; status: string } | null>(null)
  const [preview, setPreview] = useState<{ test: unknown; answer_keys: unknown } | null>(null)
  const [busy, setBusy] = useState('')
  const [mediaMsg, setMediaMsg] = useState('')

  const setP = (i: number, patch: Partial<Passage>) =>
    setPassages((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const setQ = (i: number, patch: Partial<QField>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))

  function buildPayload() {
    // ⚠️ questions KHÔNG mang đáp án; đáp án → answer_keys (tách).
    const qOut = questions.map((q) => ({ id: q.id, number: Number(q.number) || 0, type: q.type, prompt: q.prompt }))
    const answer_keys: Record<string, { answers: string[]; match: 'ci'; points: number }> = {}
    for (const q of questions) {
      const ans = q.answers.split(',').map((s) => s.trim()).filter(Boolean)
      if (ans.length) answer_keys[q.id] = { answers: ans, match: 'ci', points: Number(q.points) || 1 }
    }
    return {
      title,
      type,
      slug: slug.trim() || undefined,
      is_free: isFree,
      duration_sec: Math.max(1, Number(durationMin) || 60) * 60,
      passages: passages.map((p) => ({ id: p.id, title: p.title, content: p.content })),
      questions: qOut,
      answer_keys: Object.keys(answer_keys).length ? answer_keys : undefined,
    }
  }

  async function submit() {
    setPhase('submitting')
    setError('')
    try {
      const r = await fetch('/api/admin/tests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      const j = await r.json().catch(() => null)
      if (r.status === 201 && j?.data?.test_id) {
        setCreated({ test_id: j.data.test_id, status: j.data.status })
      } else if (r.status === 403) {
        setError('Bạn không có quyền admin.')
      } else {
        setError((j?.message as string) || 'Không tạo được đề. Kiểm tra dữ liệu.')
      }
    } catch {
      setError('Lỗi kết nối.')
    } finally {
      setPhase('idle')
    }
  }

  async function doPreview() {
    if (!created) return
    setBusy('preview')
    try {
      const r = await fetch(`/api/admin/tests/${created.test_id}/preview`)
      const j = await r.json().catch(() => null)
      if (r.ok && j?.data) setPreview(j.data)
      else setError('Không tải được preview.')
    } finally {
      setBusy('')
    }
  }

  async function doPublish() {
    if (!created) return
    setBusy('publish')
    try {
      const r = await fetch(`/api/admin/tests/${created.test_id}/publish`, { method: 'POST' })
      const j = await r.json().catch(() => null)
      if (r.ok && j?.data) setCreated({ test_id: created.test_id, status: j.data.status })
      else setError('Không publish được.')
    } finally {
      setBusy('')
    }
  }

  async function doMedia(kind: 'image' | 'audio') {
    if (!created) return
    setBusy('media')
    setMediaMsg('')
    try {
      const r = await fetch('/api/admin/media', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, filename: `${kind}-${Date.now()}.${kind === 'audio' ? 'mp3' : 'png'}`, test_id: created.test_id }),
      })
      const j = await r.json().catch(() => null)
      if (r.ok && j?.data?.upload_url) setMediaMsg(`✓ Đã tạo upload URL (${kind}). FE PUT file lên URL này.`)
      else if (j?.meta?.error_code === 'STORAGE_NOT_CONFIGURED') setMediaMsg(`⚠️ Storage chưa cấu hình (${kind}) — cần creds R2/bucket (Owner/DevOps).`)
      else setMediaMsg('Không tạo được upload URL.')
    } finally {
      setBusy('')
    }
  }

  const labelCls = 'block text-xs font-semibold text-slate-600'
  const inputCls = 'mt-1 w-full rounded-md border border-slate-300 p-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500'

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/admin" className="text-sm text-teal-700 underline">← Dashboard</Link>
        <h1 className="text-xl font-bold text-slate-800">Tạo đề mới</h1>
      </div>

      <p className="mb-4 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        Đáp án nhập ở ô <b>“Đáp án”</b> riêng của từng câu — hệ thống lưu vào <code>answer_keys</code> (server-only),
        KHÔNG đưa vào đề. Đề chỉ chứa passage + câu hỏi.
      </p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Meta + passages */}
        <section className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-semibold text-slate-800">Thông tin đề</h2>
            <label className={labelCls}>Tiêu đề
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Reading Test 1" />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className={labelCls}>Loại
                <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as TestType)}>
                  <option value="reading">reading</option>
                  <option value="listening">listening</option>
                  <option value="writing">writing</option>
                </select>
              </label>
              <label className={labelCls}>Thời gian (phút)
                <input className={inputCls} type="number" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
              </label>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className={labelCls}>Slug (tuỳ chọn)
                <input className={inputCls} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="reading-test-1" />
              </label>
              <label className="mt-5 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} /> Miễn phí
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Passages</h2>
              <button type="button" onClick={() => setPassages((ps) => [...ps, { id: uid('p'), title: `Passage ${ps.length + 1}`, content: '' }])} className="text-xs text-teal-700 underline">+ Thêm passage</button>
            </div>
            {passages.map((p, i) => (
              <div key={p.id} className="mb-3 rounded border border-slate-100 p-2">
                <div className="flex items-center gap-2">
                  <input className={inputCls} value={p.title} onChange={(e) => setP(i, { title: e.target.value })} placeholder="Tiêu đề passage" />
                  {passages.length > 1 && <button type="button" onClick={() => setPassages((ps) => ps.filter((_, j) => j !== i))} className="text-xs text-rose-600">Xoá</button>}
                </div>
                <textarea className={`${inputCls} mt-2`} rows={4} value={p.content} onChange={(e) => setP(i, { content: e.target.value })} placeholder="Nội dung passage…" />
              </div>
            ))}
          </div>
        </section>

        {/* Questions + answer keys */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Câu hỏi + đáp án (tách)</h2>
            <button type="button" onClick={() => setQuestions((qs) => [...qs, { id: uid('q'), number: String(qs.length + 1), type: 'gap_filling', prompt: '', answers: '', points: '1' }])} className="text-xs text-teal-700 underline">+ Thêm câu</button>
          </div>
          {questions.map((q, i) => (
            <div key={q.id} className="mb-3 rounded border border-slate-100 p-2">
              <div className="grid grid-cols-3 gap-2">
                <label className={labelCls}>Số
                  <input className={inputCls} value={q.number} onChange={(e) => setQ(i, { number: e.target.value })} />
                </label>
                <label className={`${labelCls} col-span-2`}>Dạng
                  <select className={inputCls} value={q.type} onChange={(e) => setQ(i, { type: e.target.value })}>
                    {Q_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              </div>
              <label className={`${labelCls} mt-2`}>Câu hỏi / prompt
                <input className={inputCls} value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} placeholder="Nội dung câu hỏi" />
              </label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className={`${labelCls} col-span-2`}>Đáp án <span className="text-amber-600">(tách → answer_keys)</span>
                  <input className={inputCls} value={q.answers} onChange={(e) => setQ(i, { answers: e.target.value })} placeholder="đáp án, cách nhau dấu phẩy" />
                </label>
                <label className={labelCls}>Điểm
                  <input className={inputCls} type="number" value={q.points} onChange={(e) => setQ(i, { points: e.target.value })} />
                </label>
              </div>
              {questions.length > 1 && <button type="button" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} className="mt-1 text-xs text-rose-600">Xoá câu</button>}
            </div>
          ))}
        </section>
      </div>

      {error && <p aria-live="assertive" className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!created ? (
        <button type="button" onClick={submit} disabled={phase === 'submitting' || !title}
          className="mt-4 rounded-md bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300">
          {phase === 'submitting' ? 'Đang lưu…' : 'Lưu đề (draft)'}
        </button>
      ) : (
        <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 p-4">
          <p className="text-sm text-teal-800">✓ Đã lưu đề <code className="font-mono">{created.test_id.slice(0, 8)}…</code> — trạng thái: <b>{created.status}</b></p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={doPreview} disabled={busy === 'preview'} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">Preview</button>
            <button type="button" onClick={doPublish} disabled={busy === 'publish' || created.status === 'published'} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:bg-slate-400">{created.status === 'published' ? 'Đã publish' : 'Publish'}</button>
            <button type="button" onClick={() => doMedia('image')} disabled={busy === 'media'} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">Upload ảnh</button>
            <button type="button" onClick={() => doMedia('audio')} disabled={busy === 'media'} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">Upload audio</button>
          </div>
          {mediaMsg && <p className="mt-2 text-xs text-slate-600">{mediaMsg}</p>}
          {preview && (
            <pre className="mt-3 max-h-72 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(preview, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  )
}
