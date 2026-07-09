'use client'

import { useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import { ExamRunner } from '@/components/exam/ExamRunner'
import { examFontVars } from '@/app/exam-fonts'
import type { ExamPayload } from '@/types/exam'

// W12 — Admin test form (M11). LUẬT THÉP #2: đáp án nhập ở Ô RIÊNG → build vào answer_keys, KHÔNG vào questions.
//   Guard thật ở server (admin layout + /api/admin/* requireAdmin); form chỉ gọi API. KHÔNG import scoring/secret.
//   Layout theo design frame 6; logic/data flow GIỮ NGUYÊN (chỉ thay markup).
type TestType = 'reading' | 'listening' | 'writing'
type Passage = { id: string; title: string; content: string }
type QOpt = { key: string; text: string }
// QField mang đủ field renderer (M06) hỗ trợ: đáp án tách sang `answers`/`points`/`explanation` (→ answer_keys),
//   còn lại đi vào tests.questions. instruction/passage_id điều khiển gom nhóm + header "Questions a–b".
type QField = {
  id: string
  number: string
  type: string
  prompt: string
  answers: string
  points: string
  // rich authoring (P2) — tùy chọn, chỉ emit khi có giá trị
  passage_id?: string
  instruction?: string
  statement?: string
  options?: QOpt[]
  select_count?: string
  image?: string
  x?: string
  y?: string
  // review evidence (P3) — vào answer_keys entry, KHÔNG vào questions
  explanation?: string
}

const Q_TYPES = ['gap_filling', 'mcq', 'mcq_multi', 'tfng', 'ynng', 'matching', 'short_answer', 'diagram', 'map']

// question.type (form) → answer_keys entry.type hợp lệ (ALLOWED_KEY_TYPES, score-reading.ts).
//   Bắt buộc cho mcq_multi (chấm theo SET) + diagram/map (single-value đúng nhãn).
const KEY_TYPE: Record<string, string> = {
  gap_filling: 'gap_filling',
  short_answer: 'short_answer',
  mcq: 'mcq',
  mcq_multi: 'mcq_multi',
  tfng: 'tfng',
  ynng: 'ynng',
  matching: 'matching',
  diagram: 'diagram_label',
  map: 'map_labelling',
}
// Loại câu cần bank options (hiện editor options). matching cũng dùng options làm bank ghép.
const NEEDS_OPTIONS = new Set(['mcq', 'mcq_multi', 'matching'])
const NEEDS_IMAGE = new Set(['diagram', 'map'])

// Map tên loại câu OCR/IELTS chuẩn → 6 type của form (giảm gõ tay khi import). Không khớp → 'gap_filling'.
const TYPE_ALIAS: Record<string, string> = {
  mcq_single: 'mcq', multiple_choice: 'mcq', mcq: 'mcq',
  mcq_multi: 'mcq_multi', multi_select: 'mcq_multi', multiple_answer: 'mcq_multi',
  true_false_notgiven: 'tfng', tf_ng: 'tfng', tfng: 'tfng',
  yes_no_notgiven: 'ynng', yn_ng: 'ynng', ynng: 'ynng',
  matching_headings: 'matching', matching_information: 'matching', matching_features: 'matching',
  matching_sentence_endings: 'matching', matching_paragraphs: 'matching', matching_endings: 'matching', matching: 'matching',
  summary_completion: 'gap_filling', sentence_completion: 'gap_filling', note_completion: 'gap_filling',
  table_completion: 'gap_filling', flowchart_completion: 'gap_filling', form_completion: 'gap_filling',
  gap_filling: 'gap_filling', fill_blank: 'gap_filling',
  short_answer: 'short_answer',
  // Diagram/map label (renderer M06 hỗ trợ ảnh overlay + dòng chấm)
  diagram_label: 'diagram', diagram: 'diagram',
  map_labelling: 'map', plan_map_diagram: 'map', map: 'map', plan: 'map',
}
function normType(t: unknown): string {
  const k = String(t ?? '').toLowerCase().trim()
  return TYPE_ALIAS[k] ?? (Q_TYPES.includes(k) ? k : 'gap_filling')
}
const SKILLS: { id: TestType; label: string }[] = [
  { id: 'reading', label: 'Reading' },
  { id: 'listening', label: 'Listening' },
  { id: 'writing', label: 'Writing' },
]
const TYPE_CHIP: Record<string, { bg: string; color: string }> = {
  tfng: { bg: '#FFEDE6', color: '#C7542F' },
  ynng: { bg: '#FFEDE6', color: '#C7542F' },
  mcq: { bg: '#FFF3DC', color: '#A87614' },
  mcq_multi: { bg: '#FFF3DC', color: '#A87614' },
  gap_filling: { bg: '#F0ECFF', color: '#5B43C7' },
  matching: { bg: '#F0ECFF', color: '#5B43C7' },
  short_answer: { bg: '#F0ECFF', color: '#5B43C7' },
  diagram: { bg: '#E4F3FF', color: '#1F6FB2' },
  map: { bg: '#E4F3FF', color: '#1F6FB2' },
}

function uid(p: string) {
  return p + Math.random().toString(36).slice(2, 7)
}

// Câu render-only cho tests.questions / preview — KHÔNG kèm đáp án (answers/points/explanation tách answer_keys).
//   Chỉ emit field có giá trị → giữ payload gọn, khớp shape ExamQuestion (M06).
function emitQuestion(q: QField): Record<string, unknown> {
  const out: Record<string, unknown> = { id: q.id, number: Number(q.number) || 0, type: q.type, prompt: q.prompt }
  if (q.passage_id?.trim()) out.passage_id = q.passage_id.trim()
  if (q.instruction?.trim()) out.instruction = q.instruction.trim()
  if (q.statement?.trim()) out.statement = q.statement.trim()
  if (NEEDS_OPTIONS.has(q.type) && Array.isArray(q.options)) {
    const opts = q.options
      .map((o, i) => {
        const key = o.key.trim() || String.fromCharCode(65 + i) // A,B,C… nếu admin bỏ trống key
        const text = o.text.trim()
        return { key, text: text || key }
      })
      .filter((o) => o.text || o.key)
    if (opts.length) out.options = opts
  }
  if (q.type === 'mcq_multi' && q.select_count?.trim()) {
    const sc = Number(q.select_count)
    if (Number.isFinite(sc) && sc > 0) out.select_count = sc
  }
  if (NEEDS_IMAGE.has(q.type)) {
    if (q.image?.trim()) out.image = q.image.trim()
    const x = Number(q.x)
    const y = Number(q.y)
    if (q.x?.trim() && Number.isFinite(x)) out.x = x
    if (q.y?.trim() && Number.isFinite(y)) out.y = y
  }
  return out
}

// Đọc options từ draft (mảng {key,text} | {key,label} | string) → QOpt[] cho form.
function parseRawOpts(v: unknown): QOpt[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v
    .map((o) => {
      if (o && typeof o === 'object') {
        const r = o as Record<string, unknown>
        return { key: String(r.key ?? ''), text: String(r.text ?? r.label ?? '') }
      }
      return { key: '', text: String(o ?? '') }
    })
    .filter((o) => o.key || o.text)
  return out.length ? out : undefined
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
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importMsg, setImportMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  // Preview GIAO DIỆN THI thật (2026-07-08): dựng ExamPayload local từ state → ExamRunner preview mode.
  //   KHÔNG gửi answer_keys vào payload (đúng luật thép #2 — payload thi không bao giờ mang đáp án).
  const [examPreview, setExamPreview] = useState<{ payload: ExamPayload; durationSec: number } | null>(null)

  function openExamPreview() {
    const payload: ExamPayload = {
      test: { id: '__admin_preview__', title: title || '(Chưa có tiêu đề)', skill: type, is_free: isFree },
      passages: passages.map((p) => ({ id: p.id, title: p.title, content: p.content })),
      questions: questions.map(emitQuestion), // rich fields (options/instruction/image/x/y) để preview đúng format thi
      audio_url: null, // audio ký URL chỉ sau access guard — preview không phát audio
    }
    setExamPreview({ payload, durationSec: Math.max(1, Number(durationMin) || 60) * 60 })
  }

  const setP = (i: number, patch: Partial<Passage>) => setPassages((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const setQ = (i: number, patch: Partial<QField>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))

  function buildPayload() {
    // ⚠️ questions KHÔNG mang đáp án; đáp án + explanation → answer_keys (tách, server-only).
    const qOut = questions.map(emitQuestion)
    type KeyEntry = { answers: string[]; match: 'ci'; points: number; type?: string; explanation?: string }
    const answer_keys: Record<string, KeyEntry> = {}
    for (const q of questions) {
      const ans = q.answers.split(',').map((s) => s.trim()).filter(Boolean)
      // Entry BẮT BUỘC có answers (AnswerKeyEntrySchema.min(1)); explanation chỉ đính khi đã có đáp án.
      if (!ans.length) continue
      const entry: KeyEntry = { answers: ans, match: 'ci', points: Number(q.points) || 1 }
      const kt = KEY_TYPE[q.type]
      if (kt) entry.type = kt // mcq_multi chấm theo SET; diagram/map single-value đúng nhãn
      const exp = q.explanation?.trim()
      if (exp) entry.explanation = exp
      answer_keys[q.id] = entry
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

  // Nạp test.draft.json (từ pipeline scan) → đổ đầy state. Map body→content, reverse answer_keys→ô đáp án, chuẩn hoá type.
  function importDraft(rawText: string) {
    setImportMsg(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(rawText)
    } catch {
      setImportMsg({ tone: 'err', text: 'JSON không hợp lệ — kiểm tra lại nội dung dán/tải.' })
      return
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setImportMsg({ tone: 'err', text: 'File phải là một object đề (test.draft.json).' })
      return
    }
    const data = parsed as Record<string, unknown>
    const str = (v: unknown) => (typeof v === 'string' ? v : '')

    if (str(data.title)) setTitle(str(data.title))
    if (data.type === 'reading' || data.type === 'listening' || data.type === 'writing') setType(data.type)
    if (str(data.slug)) setSlug(str(data.slug))
    if (typeof data.is_free === 'boolean') setIsFree(data.is_free)
    const dsec = Number(data.duration_sec)
    if (Number.isFinite(dsec) && dsec > 0) setDurationMin(String(Math.round(dsec / 60)))

    const ak =
      data.answer_keys && typeof data.answer_keys === 'object' && !Array.isArray(data.answer_keys)
        ? (data.answer_keys as Record<string, unknown>)
        : {}

    const ps = Array.isArray(data.passages) ? data.passages : []
    const mappedP: Passage[] = ps.map((raw, i) => {
      const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
      return { id: String(p.id ?? uid('p')), title: str(p.title) || `Passage ${i + 1}`, content: str(p.body) || str(p.content) }
    })

    const qs = Array.isArray(data.questions) ? data.questions : []
    const mappedQ: QField[] = qs.map((raw, i) => {
      const q = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
      const id = String(q.id ?? uid('q'))
      const keyRaw = ak[id]
      const key = keyRaw && typeof keyRaw === 'object' ? (keyRaw as Record<string, unknown>) : null
      const answers = key && Array.isArray(key.answers) ? key.answers.map((a) => String(a)).join(', ') : str(q.answers)
      const points = key && key.points != null ? String(key.points) : '1'
      const numRaw = q.number
      const number = String(typeof numRaw === 'number' || typeof numRaw === 'string' ? numRaw : i + 1)
      const out: QField = { id, number, type: normType(q.type), prompt: str(q.prompt), answers, points }
      // Giữ rich fields từ draft (trước đây bị vứt → mất gom nhóm passage/MCQ/diagram).
      if (str(q.passage_id)) out.passage_id = str(q.passage_id)
      if (str(q.instruction)) out.instruction = str(q.instruction)
      if (str(q.statement)) out.statement = str(q.statement)
      const opts = parseRawOpts(q.options)
      if (opts) out.options = opts
      if (q.select_count != null) out.select_count = String(q.select_count)
      if (str(q.image)) out.image = str(q.image)
      if (q.x != null) out.x = String(q.x)
      if (q.y != null) out.y = String(q.y)
      if (key && typeof key.explanation === 'string') out.explanation = key.explanation
      return out
    })

    if (mappedP.length) setPassages(mappedP)
    if (mappedQ.length) setQuestions(mappedQ)

    const noAns = mappedQ.filter((q) => !q.answers.trim()).length
    const bits = [`nạp ${mappedP.length} passage · ${mappedQ.length} câu`]
    if (noAns) bits.push(`${noAns} câu CHƯA có đáp án (gõ tay ở ô 🔒)`)
    setImportMsg({ tone: 'ok', text: `✓ Đã ${bits.join(' · ')}. Rà lại type + đáp án rồi Lưu.` })
    setShowImport(false)
    setShowPreview(true)
  }

  function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    f.text().then((t) => { setImportText(t); importDraft(t) }).catch(() => setImportMsg({ tone: 'err', text: 'Không đọc được file.' }))
  }

  // Kiểm lỗi hiển thị trước khi publish (dựng từ state hiện tại — không cần lưu).
  function lintIssues(): { level: 'error' | 'warn'; text: string }[] {
    const out: { level: 'error' | 'warn'; text: string }[] = []
    if (!title.trim()) out.push({ level: 'error', text: 'Chưa có tiêu đề đề.' })
    if (type !== 'writing') {
      if (passages.length === 0) out.push({ level: 'warn', text: 'Chưa có passage nào.' })
      passages.forEach((p, i) => {
        if (!p.content.trim()) out.push({ level: 'warn', text: `Passage ${i + 1} ("${p.title || '—'}") đang trống.` })
      })
    }
    if (questions.length === 0) out.push({ level: 'warn', text: 'Chưa có câu hỏi nào.' })
    const seen = new Map<number, number>()
    questions.forEach((q, i) => {
      const lbl = `Câu ${q.number || i + 1}`
      if (!q.prompt.trim()) out.push({ level: 'warn', text: `${lbl}: nội dung câu hỏi trống.` })
      if (!q.answers.trim()) out.push({ level: 'warn', text: `${lbl}: chưa có đáp án.` })
      if (NEEDS_OPTIONS.has(q.type) && !(q.options ?? []).some((o) => o.text.trim() || o.key.trim()))
        out.push({ level: 'warn', text: `${lbl}: loại "${q.type}" cần bank lựa chọn (options) — thí sinh sẽ thấy "thiếu lựa chọn".` })
      const n = Number(q.number)
      if (!Number.isInteger(n) || n < 1) out.push({ level: 'error', text: `${lbl}: số câu không hợp lệ.` })
      else seen.set(n, (seen.get(n) ?? 0) + 1)
    })
    for (const [n, c] of seen) if (c > 1) out.push({ level: 'error', text: `Số câu ${n} bị trùng (${c} lần).` })
    return out
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

      {/* Import JSON (từ pipeline scan đề) */}
      <div className="mt-4 rounded-[13px] border border-[#D9CFFF] bg-[#FBFAFF] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13px] font-extrabold text-[#5B43C7]">Nhập từ JSON (file test.draft.json từ tool scan)</div>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded-[9px] border border-[#D9CFFF] bg-white px-3 py-1.5 text-[12.5px] font-bold text-[#5B43C7] transition hover:bg-[#F4F1FB]">
              Chọn file .json
              <input type="file" accept="application/json,.json" hidden onChange={onImportFile} />
            </label>
            <button type="button" onClick={() => setShowImport((v) => !v)} className="rounded-[9px] px-3 py-1.5 text-[12.5px] font-bold text-[#6A48D6]">
              {showImport ? 'Ẩn ô dán' : 'Dán JSON'}
            </button>
          </div>
        </div>
        {showImport && (
          <div className="mt-3">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={5}
              placeholder="Dán nội dung test.draft.json vào đây…"
              className={`${inputCls} font-mono text-xs`}
            />
            <button type="button" onClick={() => importDraft(importText)} className="mt-2 rounded-[9px] bg-[#7C5CE6] px-4 py-2 text-[13px] font-bold text-white transition hover:bg-[#6A48D6]">
              Nạp vào form →
            </button>
          </div>
        )}
        {importMsg && (
          <p className={`mt-2 text-[12.5px] font-bold ${importMsg.tone === 'ok' ? 'text-[#1E9E63]' : 'text-[#D24A4A]'}`}>{importMsg.text}</p>
        )}
        <p className="mt-2 text-[11.5px] font-semibold leading-[1.5] text-[#9088A2]">
          Đổ đầy tiêu đề · passages · câu hỏi. ⚠️ <b>answer_keys từ OCR thường rỗng</b> — bắt buộc gõ tay ở ô 🔒 mỗi câu (key sai = chấm sai).
        </p>
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

                {/* Gom nhóm: passage/section + instruction (câu liên tiếp cùng instruction → 1 block "Questions a–b") */}
                <div className="mt-2.5 grid gap-2 sm:grid-cols-[minmax(0,170px)_1fr]">
                  <select
                    className={inputCls}
                    value={q.passage_id ?? ''}
                    onChange={(e) => setQ(i, { passage_id: e.target.value || undefined })}
                    aria-label="Passage / Section của câu"
                    title="Gán câu vào Passage/Section (để chuyển nhóm đúng như đề thật)"
                  >
                    <option value="">— Passage/Section: chưa gán —</option>
                    {passages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title || p.id}
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputCls}
                    value={q.instruction ?? ''}
                    onChange={(e) => setQ(i, { instruction: e.target.value || undefined })}
                    placeholder="Hướng dẫn nhóm, VD: Complete the sentences. Write NO MORE THAN TWO WORDS…"
                  />
                </div>

                {/* Bank lựa chọn cho MCQ / matching — KEY là giá trị nhập ở ô đáp án */}
                {NEEDS_OPTIONS.has(q.type) && (
                  <div className="mt-2.5 rounded-[10px] border border-[#F1E4C8] bg-[#FFFBF2] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-[#A87614]">
                        Lựa chọn (bank) · KEY = giá trị chấm
                      </span>
                      {q.type === 'mcq_multi' && (
                        <label className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#A87614]">
                          Chọn
                          <input
                            className="w-12 rounded-[6px] border border-[#F1E4C8] bg-white px-1.5 py-0.5 text-center outline-none"
                            value={q.select_count ?? ''}
                            onChange={(e) => setQ(i, { select_count: e.target.value })}
                            placeholder="2"
                            aria-label="Số đáp án cần chọn"
                          />
                          đáp án
                        </label>
                      )}
                    </div>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {(q.options ?? []).map((o, oi) => (
                        <div key={oi} className="flex items-center gap-1.5">
                          <input
                            className="w-14 flex-none rounded-[7px] border border-[#F1E4C8] bg-white px-2 py-1.5 text-center text-[12.5px] font-bold text-[#8A6410] outline-none"
                            value={o.key}
                            onChange={(e) => {
                              const next = [...(q.options ?? [])]
                              next[oi] = { ...next[oi], key: e.target.value }
                              setQ(i, { options: next })
                            }}
                            placeholder={String.fromCharCode(65 + oi)}
                            aria-label="Key lựa chọn"
                          />
                          <input
                            className="min-w-0 flex-1 rounded-[8px] border border-[#F1E4C8] bg-white px-3 py-1.5 text-sm text-[#2A2740] outline-none"
                            value={o.text}
                            onChange={(e) => {
                              const next = [...(q.options ?? [])]
                              next[oi] = { ...next[oi], text: e.target.value }
                              setQ(i, { options: next })
                            }}
                            placeholder="Nội dung lựa chọn"
                          />
                          <button
                            type="button"
                            onClick={() => setQ(i, { options: (q.options ?? []).filter((_, j) => j !== oi) })}
                            className="flex-none px-1 text-[13px] font-bold text-[#C8C2D2] hover:text-[#D08585]"
                            aria-label="Xoá lựa chọn"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setQ(i, { options: [...(q.options ?? []), { key: '', text: '' }] })}
                      className="mt-2 text-[12px] font-bold text-[#A87614]"
                    >
                      + Thêm lựa chọn
                    </button>
                  </div>
                )}

                {/* Sơ đồ cho diagram/map — có ảnh: overlay ô theo x/y%; bỏ trống ảnh: chế độ dòng chấm "N …… [ô]" */}
                {NEEDS_IMAGE.has(q.type) && (
                  <div className="mt-2.5 rounded-[10px] border border-[#CBE6F7] bg-[#F3FAFF] p-3">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-[#1F6FB2]">Sơ đồ (diagram / map)</span>
                    <input
                      className={`${inputCls} mt-2`}
                      value={q.image ?? ''}
                      onChange={(e) => setQ(i, { image: e.target.value || undefined })}
                      placeholder="URL ảnh sơ đồ (bỏ trống → dòng chấm 'N …… [ô nhập]')"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] font-bold text-[#1F6FB2]">
                      <span>Vị trí ô nhập trên ảnh (%):</span>
                      <input className="w-16 rounded-[7px] border border-[#CBE6F7] bg-white px-2 py-1 text-center outline-none" value={q.x ?? ''} onChange={(e) => setQ(i, { x: e.target.value })} placeholder="x" aria-label="x %" />
                      <input className="w-16 rounded-[7px] border border-[#CBE6F7] bg-white px-2 py-1 text-center outline-none" value={q.y ?? ''} onChange={(e) => setQ(i, { y: e.target.value })} placeholder="y" aria-label="y %" />
                    </div>
                  </div>
                )}

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
                  {/* Giải thích (P3) — chỉ hiện ở review sau nộp (owner + đã nộp); server-only cùng answer_keys */}
                  <div className="mt-2.5">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-[#157A4B]">💡 Giải thích (xem chi tiết sau nộp)</span>
                    <textarea
                      className="mt-1 w-full rounded-[8px] border border-[#D6EFE0] bg-white px-3 py-2 text-[12.5px] leading-[1.5] text-[#2A2740] outline-none"
                      rows={2}
                      value={q.explanation ?? ''}
                      onChange={(e) => setQ(i, { explanation: e.target.value || undefined })}
                      placeholder="Câu evidence trong passage (+ dịch) → hiện khi thí sinh xem chi tiết. Bỏ trống nếu chưa có."
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Preview + kiểm lỗi (dựng từ state, không cần lưu) */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="rounded-[11px] border border-[#E4DEEE] bg-white px-4 py-2.5 text-sm font-bold text-[#2A2740] transition hover:border-[#CCC3DC]"
        >
          {showPreview ? 'Ẩn xem trước' : '👁 Xem trước & kiểm lỗi'}
        </button>
        <button
          type="button"
          onClick={openExamPreview}
          disabled={type === 'writing'}
          title={type === 'writing' ? 'Preview giao diện thi hiện hỗ trợ Reading/Listening' : 'Mở đề trong giao diện làm bài thật để soát định dạng'}
          className="rounded-[11px] border border-[#D9CFF2] bg-[#F6F2FF] px-4 py-2.5 text-sm font-bold text-[#5B43C7] transition hover:border-[#B9A7E6] disabled:cursor-not-allowed disabled:opacity-50"
        >
          🖥 Xem giao diện thi
        </button>
        {showPreview &&
          (() => {
            const n = lintIssues()
            const hasErr = n.some((i) => i.level === 'error')
            return (
              <span className="text-[12.5px] font-extrabold" style={{ color: hasErr ? '#D24A4A' : n.length ? '#C98A1A' : '#1E9E63' }}>
                {n.length ? `${n.length} điểm cần kiểm tra` : '✓ Không phát hiện lỗi'}
              </span>
            )
          })()}
      </div>

      {showPreview &&
        (() => {
          const issues = lintIssues()
          const sortedQ = [...questions].sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0))
          return (
            <div className="mt-3 rounded-[13px] border border-[#E4DEEE] bg-[#FBFAFE] p-5">
              {issues.length > 0 ? (
                <div className="mb-4 rounded-[10px] border border-[#F1D9A8] bg-[#FFF9EC] p-3">
                  <div className="text-[12.5px] font-extrabold text-[#A87614]">⚠️ {issues.length} điểm cần kiểm tra trước khi publish</div>
                  <ul className="mt-2 flex flex-col gap-1">
                    {issues.map((it, k) => (
                      <li key={k} className="text-[12.5px] font-semibold" style={{ color: it.level === 'error' ? '#D24A4A' : '#B5791A' }}>
                        {it.level === 'error' ? '⛔' : '•'} {it.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mb-4 rounded-[10px] border border-[#BFE9CF] bg-[#EAF9F0] p-3 text-[13px] font-bold text-[#1E7A48]">
                  ✓ Không phát hiện lỗi hiển thị. Vẫn nên rà đáp án lần cuối.
                </div>
              )}

              <div className="rounded-[12px] border border-[#ECE9F2] bg-white p-5">
                <div className="text-[19px] font-extrabold tracking-[-0.02em] text-[#2A2740]">{title || '(chưa có tiêu đề)'}</div>
                <div className="mt-1.5 flex flex-wrap gap-2 text-[11.5px] font-bold">
                  <span className="rounded-full bg-[#F0ECFF] px-2.5 py-1 text-[#5B43C7]">{type}</span>
                  <span className="rounded-full bg-[#EEF0F4] px-2.5 py-1 text-[#5B6270]">{durationMin} phút</span>
                  <span className="rounded-full px-2.5 py-1" style={{ background: isFree ? '#E7F7EE' : '#FFF3DC', color: isFree ? '#1E9E63' : '#A87614' }}>
                    {isFree ? 'Miễn phí' : 'Tính phí'}
                  </span>
                </div>

                {passages.map((p, i) => (
                  <div key={p.id} className="mt-4">
                    <div className="text-[14px] font-extrabold text-[#2A2740]">{p.title || `Passage ${i + 1}`}</div>
                    {p.content.trim() ? (
                      <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-[1.7] text-[#3B364A]">{p.content}</p>
                    ) : (
                      <p className="mt-1.5 text-[13px] italic text-[#C0392B]">— passage trống —</p>
                    )}
                  </div>
                ))}

                <div className="mt-5 text-[13px] font-extrabold uppercase tracking-[0.04em] text-[#9088A2]">Câu hỏi ({sortedQ.length})</div>
                <div className="mt-2 flex flex-col gap-2.5">
                  {sortedQ.map((q) => {
                    const chip = TYPE_CHIP[q.type] ?? { bg: '#F0ECFF', color: '#5B43C7' }
                    return (
                      <div key={q.id} className="rounded-[10px] border border-[#EFEBF2] bg-[#FCFBFE] p-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-[24px] min-w-[24px] items-center justify-center rounded-[7px] bg-[#2A2740] px-1.5 text-[12px] font-extrabold text-white">
                            {q.number || '?'}
                          </span>
                          <span className="rounded-[6px] px-2 py-0.5 text-[11px] font-extrabold" style={{ background: chip.bg, color: chip.color }}>
                            {q.type}
                          </span>
                        </div>
                        <div className={`mt-2 text-[13.5px] ${q.prompt.trim() ? 'text-[#2A2740]' : 'italic text-[#C0392B]'}`}>
                          {q.prompt.trim() || '— chưa có nội dung câu hỏi —'}
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[12.5px]">
                          <span className="font-extrabold text-[#1E9E63]">🔒 Đáp án:</span>
                          {q.answers.trim() ? (
                            <span className="font-mono font-bold text-[#157A4B]">{q.answers}</span>
                          ) : (
                            <span className="italic text-[#C0392B]">chưa nhập</span>
                          )}
                          <span className="ml-auto text-[#9088A2]">{q.points || '1'} điểm</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <p className="mt-2 text-[11.5px] font-semibold text-[#9088A2]">
                Xem trước dựng từ dữ liệu đang nhập (chưa lưu). Đáp án chỉ hiện ở màn admin để bạn rà — không gửi ra client thi thật.
              </p>
            </div>
          )
        })()}

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
              Xem JSON đã lưu (server)
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

      {/* Preview giao diện thi thật (fullscreen overlay) — ExamRunner preview mode, KHÔNG API/attempt */}
      {examPreview && (
        <div className="fixed inset-0 z-[100] overflow-auto bg-[#F4F1F8]">
          <button
            type="button"
            onClick={() => setExamPreview(null)}
            className="fixed right-4 top-3 z-[110] rounded-[11px] bg-[#2A2740] px-4 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-[#17152A]"
          >
            ✕ Đóng preview
          </button>
          <div className={examFontVars}>
            <ExamRunner testId="__admin_preview__" preview={examPreview} />
          </div>
        </div>
      )}
    </div>
  )
}
