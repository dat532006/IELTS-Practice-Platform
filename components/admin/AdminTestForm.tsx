'use client'

import { useState } from 'react'
import Link from 'next/link'

// W12 — Admin test form (M11). LUẬT THÉP #2: đáp án nhập ở Ô RIÊNG → build vào answer_keys, KHÔNG vào questions.
//   Guard thật ở server (admin layout + /api/admin/* requireAdmin); form chỉ gọi API. KHÔNG import scoring/secret.
//   Layout theo design frame 6; logic/data flow GIỮ NGUYÊN (chỉ thay markup).
type TestType = 'reading' | 'listening' | 'writing'
type Passage = { id: string; title: string; content: string }
type QField = { id: string; number: string; type: string; prompt: string; answers: string; points: string }

const Q_TYPES = ['gap_filling', 'mcq', 'tfng', 'ynng', 'matching', 'short_answer']
const SKILLS: { id: TestType; label: string }[] = [
  { id: 'reading', label: 'Reading' },
  { id: 'listening', label: 'Listening' },
  { id: 'writing', label: 'Writing' },
]
const TYPE_CHIP: Record<string, { bg: string; color: string }> = {
  tfng: { bg: '#FFEDE6', color: '#C7542F' },
  ynng: { bg: '#FFEDE6', color: '#C7542F' },
  mcq: { bg: '#FFF3DC', color: '#A87614' },
  gap_filling: { bg: '#F0ECFF', color: '#5B43C7' },
  matching: { bg: '#F0ECFF', color: '#5B43C7' },
  short_answer: { bg: '#F0ECFF', color: '#5B43C7' },
}

function uid(p: string) {
  return p + Math.random().toString(36).slice(2, 7)
}

const labelCls = 'block text-[12.5px] font-extrabold text-[#6A6480] mb-1.5'
const inputCls =
  'w-full rounded-[11px] border border-[#E4DEEE] bg-white px-3.5 py-3 text-sm text-[#2A2740] focus:border-[#7C5CE6] focus:outline-none'

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

  const setP = (i: number, patch: Partial<Passage>) => setPassages((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const setQ = (i: number, patch: Partial<QField>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))

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
      if (r.status === 201 && j?.data?.test_id) setCreated({ test_id: j.data.test_id, status: j.data.status })
      else if (r.status === 403) setError('Bạn không có quyền admin.')
      else setError((j?.message as string) || 'Không tạo được đề. Kiểm tra dữ liệu.')
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

  return (
    <div className="rounded-[20px] border border-[#E7E4EE] bg-white p-6 text-[#2A2740] shadow-[0_30px_60px_-38px_rgba(60,40,90,0.4)] sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-sm font-semibold text-[#6A48D6] underline">
              ← Dashboard
            </Link>
            <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">Tạo đề mới</h1>
          </div>
          <p className="mt-1 text-[13.5px] font-semibold text-[#857F96]">Đáp án tách sang answer_keys — không bao giờ gửi về client.</p>
        </div>
        <span className="rounded-full bg-[#EFEBF2] px-2.5 py-[5px] text-[12px] font-extrabold text-[#8B8398]">
          {created ? created.status : 'chưa lưu'}
        </span>
      </div>

      {/* meta row */}
      <div className="mt-5 grid gap-3.5 sm:grid-cols-[2fr_1fr_1fr]">
        <div>
          <div className={labelCls}>Tiêu đề đề</div>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Reading Test 03 — Urban farming" />
        </div>
        <div>
          <div className={labelCls}>Kỹ năng</div>
          <div className="flex gap-1.5 rounded-[11px] bg-[#F4F1FB] p-1">
            {SKILLS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setType(s.id)}
                className={`flex-1 rounded-[8px] py-2.5 text-[13px] font-bold transition ${
                  type === s.id ? 'bg-white text-[#2A2740] shadow-[0_4px_10px_-4px_rgba(42,39,64,0.2)]' : 'text-[#857F96]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className={labelCls}>Thời gian (phút)</div>
          <input className={inputCls} type="number" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
        </div>
      </div>

      {/* slug + free */}
      <div className="mt-3.5 grid gap-3.5 sm:grid-cols-[2fr_1fr_1fr]">
        <div>
          <div className={labelCls}>Slug (tuỳ chọn)</div>
          <input className={`${inputCls} font-mono`} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="reading-test-3" />
        </div>
        <label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold text-[#564F6B]">
          <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} /> Miễn phí
        </label>
      </div>

      {/* passages */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[14px] font-extrabold text-[#2A2740]">Passage</div>
          <button
            type="button"
            onClick={() => setPassages((ps) => [...ps, { id: uid('p'), title: `Passage ${ps.length + 1}`, content: '' }])}
            className="text-[12.5px] font-bold text-[#6A48D6]"
          >
            + Thêm passage
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {passages.map((p, i) => (
            <div key={p.id} className="rounded-[13px] border border-[#E4DEEE] bg-white p-4">
              <div className="flex items-center gap-2">
                <input className={inputCls} value={p.title} onChange={(e) => setP(i, { title: e.target.value })} placeholder="Tiêu đề passage" />
                {passages.length > 1 && (
                  <button type="button" onClick={() => setPassages((ps) => ps.filter((_, j) => j !== i))} className="text-[12.5px] font-bold text-[#D08585]">
                    Xoá
                  </button>
                )}
              </div>
              <textarea
                className={`${inputCls} mt-2 min-h-[96px] leading-[1.65]`}
                rows={4}
                value={p.content}
                onChange={(e) => setP(i, { content: e.target.value })}
                placeholder="Nội dung passage…"
              />
            </div>
          ))}
        </div>
      </div>

      {/* questions builder */}
      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[14px] font-extrabold text-[#2A2740]">Câu hỏi &amp; đáp án</div>
          <button
            type="button"
            onClick={() => setQuestions((qs) => [...qs, { id: uid('q'), number: String(qs.length + 1), type: 'gap_filling', prompt: '', answers: '', points: '1' }])}
            className="text-[12.5px] font-bold text-[#6A48D6]"
          >
            + Thêm câu hỏi
          </button>
        </div>
        <div className="flex flex-col gap-[11px]">
          {questions.map((q, i) => {
            const chip = TYPE_CHIP[q.type] ?? { bg: '#F0ECFF', color: '#5B43C7' }
            return (
              <div key={q.id} className="rounded-[13px] border border-[#ECE9F2] bg-white p-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <input
                    className="h-[26px] w-[26px] flex-none rounded-[8px] bg-[#2A2740] text-center text-[12.5px] font-extrabold text-white outline-none"
                    value={q.number}
                    onChange={(e) => setQ(i, { number: e.target.value })}
                    aria-label="Số câu"
                  />
                  <select
                    className="rounded-[7px] px-2.5 py-1 text-[11.5px] font-extrabold outline-none"
                    style={{ background: chip.bg, color: chip.color }}
                    value={q.type}
                    onChange={(e) => setQ(i, { type: e.target.value })}
                  >
                    {Q_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {questions.length > 1 && (
                    <button type="button" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} className="ml-auto text-[12.5px] font-bold text-[#C8C2D2] hover:text-[#D08585]">
                      Xoá
                    </button>
                  )}
                </div>

                <input
                  className={`${inputCls} mt-3`}
                  value={q.prompt}
                  onChange={(e) => setQ(i, { prompt: e.target.value })}
                  placeholder="Nội dung câu hỏi / prompt"
                />

                {/* Đáp án — ô server-only (tách → answer_keys) */}
                <div className="mt-3 rounded-[10px] border border-[#D6EFE0] bg-[#F2FAF5] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-[#1E9E63]">🔒 Đáp án (server)</span>
                    <input
                      className="w-16 rounded-[7px] border border-[#D6EFE0] bg-white px-2 py-1 text-center text-[12px] font-bold text-[#157A4B] outline-none"
                      value={q.points}
                      onChange={(e) => setQ(i, { points: e.target.value })}
                      aria-label="Điểm"
                      title="Điểm"
                    />
                  </div>
                  <input
                    className="mt-2 w-full rounded-[8px] border border-[#D6EFE0] bg-white px-3 py-2 font-mono text-[13.5px] font-bold text-[#157A4B] outline-none"
                    value={q.answers}
                    onChange={(e) => setQ(i, { answers: e.target.value })}
                    placeholder="đáp án, cách nhau dấu phẩy"
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {error && <p aria-live="assertive" className="mt-4 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {/* footer actions */}
      {!created ? (
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={submit}
            disabled={phase === 'submitting' || !title}
            className="ml-auto rounded-[11px] bg-[#7C5CE6] px-6 py-3 text-[14.5px] font-bold text-white shadow-[0_12px_24px_-10px_rgba(124,92,230,0.45)] transition hover:bg-[#6A48D6] disabled:cursor-not-allowed disabled:bg-[#D8D2E4]"
          >
            {phase === 'submitting' ? 'Đang lưu…' : 'Lưu đề (draft) →'}
          </button>
        </div>
      ) : (
        <div className="mt-5 rounded-[13px] border border-[#D9CFFF] bg-[#FBFAFF] p-4">
          <p className="text-sm font-semibold text-[#5B43C7]">
            ✓ Đã lưu đề <code className="font-mono">{created.test_id.slice(0, 8)}…</code> — trạng thái: <b>{created.status}</b>
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button type="button" onClick={doPreview} disabled={busy === 'preview'} className="rounded-[11px] border border-[#E4DEEE] bg-white px-4 py-2.5 text-sm font-bold text-[#2A2740] hover:border-[#CCC3DC]">
              Preview đề
            </button>
            <button
              type="button"
              onClick={doPublish}
              disabled={busy === 'publish' || created.status === 'published'}
              className="rounded-[11px] bg-[#7C5CE6] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A48D6] disabled:bg-[#D8D2E4]"
            >
              {created.status === 'published' ? 'Đã publish' : 'Publish đề →'}
            </button>
            <button type="button" onClick={() => doMedia('image')} disabled={busy === 'media'} className="rounded-[11px] bg-[#F4F1FB] px-4 py-2.5 text-sm font-bold text-[#2A2740] hover:bg-[#EAE4F6]">
              Upload ảnh
            </button>
            <button type="button" onClick={() => doMedia('audio')} disabled={busy === 'media'} className="rounded-[11px] bg-[#F4F1FB] px-4 py-2.5 text-sm font-bold text-[#2A2740] hover:bg-[#EAE4F6]">
              Upload audio
            </button>
          </div>
          {mediaMsg && <p className="mt-2 text-xs text-[#6A6480]">{mediaMsg}</p>}
          {preview && (
            <pre className="mt-3 max-h-72 overflow-auto rounded-[10px] bg-[#2A2740] p-3 text-xs text-slate-100">{JSON.stringify(preview, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  )
}
