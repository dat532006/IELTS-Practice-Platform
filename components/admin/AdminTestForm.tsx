'use client'

import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { RichTextEditor, plainToHtml, looksRich } from './RichTextEditor'
import { sanitizePassageHtmlClient } from '@/lib/sanitize/passage-html-client'
import { normalizeWritingPassageIds, lintWritingPrompts } from '@/lib/exam/writing-prompts'
import { ExamRunner } from '@/components/exam/ExamRunner'
import { examFontVars } from '@/app/exam-fonts'
import type { ExamPayload } from '@/types/exam'

// W12 — Admin test form (M11). LUẬT THÉP #2: đáp án nhập ở Ô RIÊNG → build vào answer_keys, KHÔNG vào questions.
//   Guard thật ở server (admin layout + /api/admin/* requireAdmin); form chỉ gọi API. KHÔNG import scoring/secret.
//   Layout theo design frame 6; logic/data flow GIỮ NGUYÊN (chỉ thay markup).
type TestType = 'reading' | 'listening' | 'writing'
type Passage = { id: string; title: string; subtitle?: string; content: string; image?: string }
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
  evidence?: string // trích nguyên văn từ passage → review-in-exam highlight + đánh số [n]
  // EXAM-006: khử trùng khi quote lặp trong passage (tùy chọn). occurrence = lần thứ mấy (1-based).
  evidence_occurrence?: string
  evidence_context_before?: string
  evidence_context_after?: string
}

const Q_TYPES = ['gap_filling', 'summary', 'mcq', 'mcq_multi', 'tfng', 'ynng', 'matching', 'matching_information', 'matching_features', 'short_answer', 'diagram', 'map']

// Nhãn hiển thị gọn cho dropdown loại câu (phân biệt các biến thể). Không có → hiện raw type.
const TYPE_LABEL: Record<string, string> = {
  summary: 'summary (đoạn điền nhiều ô)',
  matching: 'matching (dropdown chọn)',
  matching_information: 'matching (bảng ma trận A–H)',
  matching_features: 'matching (bank hiện rõ + ô điền chữ)',
}

// question.type (form) → answer_keys entry.type hợp lệ (ALLOWED_KEY_TYPES, score-reading.ts).
//   Bắt buộc cho mcq_multi (chấm theo SET) + diagram/map (single-value đúng nhãn).
const KEY_TYPE: Record<string, string> = {
  gap_filling: 'gap_filling',
  summary: 'summary',
  short_answer: 'short_answer',
  mcq: 'mcq',
  mcq_multi: 'mcq_multi',
  tfng: 'tfng',
  ynng: 'ynng',
  matching: 'matching',
  matching_information: 'matching_information',
  matching_features: 'matching',
  diagram: 'diagram_label',
  map: 'map_labelling',
}
// Loại câu cần bank options (hiện editor options). matching* dùng options làm bank ghép/cột.
// summary: options = word-bank A–G (nếu có) → exam render bank kéo-thả; để trống = ô gõ chữ thường.
const NEEDS_OPTIONS = new Set(['mcq', 'mcq_multi', 'matching', 'matching_information', 'matching_features', 'summary'])
const NEEDS_IMAGE = new Set(['diagram', 'map'])
// Loại "gộp hàng" (statement + bank dùng chung) → cho công cụ tạo nhanh nhiều hàng 1 lần (khỏi spam thủ công).
const BULK_TYPES = new Set(['matching', 'matching_information', 'matching_features'])

// Map tên loại câu OCR/IELTS chuẩn → 6 type của form (giảm gõ tay khi import). Không khớp → 'gap_filling'.
const TYPE_ALIAS: Record<string, string> = {
  mcq_single: 'mcq', multiple_choice: 'mcq', mcq: 'mcq',
  mcq_multi: 'mcq_multi', multi_select: 'mcq_multi', multiple_answer: 'mcq_multi',
  true_false_notgiven: 'tfng', tf_ng: 'tfng', tfng: 'tfng',
  yes_no_notgiven: 'ynng', yn_ng: 'ynng', ynng: 'ynng',
  matching_headings: 'matching', matching_endings: 'matching', matching_sentence_endings: 'matching', matching: 'matching',
  // matching_information / matching_paragraphs → bảng ma trận (renderer gom ≥2 câu liên tiếp cùng bank)
  matching_information: 'matching_information', matching_paragraphs: 'matching_information', matching_matrix: 'matching_information',
  // matching_features → bank hiện rõ + ô điền chữ (option dài)
  matching_features: 'matching_features',
  // summary_completion → đoạn nhiều ô liền mạch (khác sentence/note = 1 ô/câu)
  summary: 'summary', summary_completion: 'summary',
  sentence_completion: 'gap_filling', note_completion: 'gap_filling',
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
  summary: { bg: '#F0ECFF', color: '#5B43C7' },
  matching: { bg: '#F0ECFF', color: '#5B43C7' },
  matching_information: { bg: '#F0ECFF', color: '#5B43C7' },
  matching_features: { bg: '#F0ECFF', color: '#5B43C7' },
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

// Textarea tự giãn theo nội dung — passage dài (700–900 từ) không phải nhét vào ô 4 dòng rồi cuộn (Owner UX 2026-07-09).
//   Không cắt nội dung, không scroll trong ô: cao = max(minHeight, scrollHeight). Ép textAlign left (khỏi lệch phải).
function AutoGrowTextarea(props: {
  value: string
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
  className?: string
  placeholder?: string
  minHeight?: number
}) {
  const { value, onChange, className, placeholder, minHeight = 220 } = props
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`
  }, [value, minHeight])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      className={className}
      placeholder={placeholder}
      style={{ minHeight, textAlign: 'left', overflow: 'hidden', resize: 'none' }}
    />
  )
}

// `testId` (2026-07-12): edit mode — tự fetch /api/admin/tests/[id]/preview (kênh admin riêng, có
//   answer_keys) → đổ vào form qua applyDraft (cùng mapping với import JSON); Lưu = PATCH theo id.
export function AdminTestForm({ testId }: { testId?: string } = {}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<TestType>('reading')
  const [slug, setSlug] = useState('')
  const [isFree, setIsFree] = useState(true)
  const [durationMin, setDurationMin] = useState('60')
  const [passages, setPassages] = useState<Passage[]>([{ id: 'p1', title: '', content: '' }])
  const [questions, setQuestions] = useState<QField[]>([
    { id: 'q1', number: '1', type: 'gap_filling', prompt: '', answers: '', points: '1' },
  ])
  const [bulkText, setBulkText] = useState<Record<string, string>>({}) // ô "tạo nhanh nhiều hàng" theo qid

  const [phase, setPhase] = useState<'idle' | 'submitting'>('idle')
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ test_id: string; status: string } | null>(null)
  const [preview, setPreview] = useState<{ test: unknown; answer_keys: unknown } | null>(null)
  const [busy, setBusy] = useState('')
  const [mediaMsg, setMediaMsg] = useState('')
  const [coverUrl, setCoverUrl] = useState<string | null>(null) // ảnh minh họa đề (tests.cover_image)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [showBulkAns, setShowBulkAns] = useState(false) // ô nhập đáp án hàng loạt (1 dòng = 1 câu)
  const [bulkAnsText, setBulkAnsText] = useState('')
  const [bulkAnsMsg, setBulkAnsMsg] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importMsg, setImportMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  // Preview GIAO DIỆN THI thật (2026-07-08): dựng ExamPayload local từ state → ExamRunner preview mode.
  //   KHÔNG gửi answer_keys vào payload (đúng luật thép #2 — payload thi không bao giờ mang đáp án).
  const [examPreview, setExamPreview] = useState<{ payload: ExamPayload; durationSec: number } | null>(null)
  // Edit mode (2026-07-12): trạng thái nạp đề cũ vào form.
  const [editLoading, setEditLoading] = useState(Boolean(testId))
  const [editLoadErr, setEditLoadErr] = useState('')

  // Edit boot: nạp đề cũ từ admin preview (kênh riêng có answer_keys) → applyDraft; set `created`
  //   để panel Publish/Preview/Media dùng được ngay (đề đã tồn tại, status thật từ server).
  useEffect(() => {
    if (!testId) return
    let alive = true
    ;(async () => {
      try {
        const r = await fetch(`/api/admin/tests/${testId}/preview`)
        const j = await r.json().catch(() => null)
        if (!alive) return
        if (r.ok && j?.data?.test) {
          const t = j.data.test as Record<string, unknown>
          applyDraft({ ...t, answer_keys: j.data.answer_keys ?? undefined })
          setCreated({ test_id: testId, status: String(t.status ?? 'draft') })
          setCoverUrl((t.cover_image as string | null) ?? null)
        } else if (r.status === 403) setEditLoadErr('Bạn không có quyền admin.')
        else if (r.status === 404) setEditLoadErr('Không tìm thấy đề.')
        else setEditLoadErr('Không tải được đề.')
      } catch {
        if (alive) setEditLoadErr('Lỗi kết nối.')
      } finally {
        if (alive) setEditLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [testId]) // eslint-disable-line react-hooks/exhaustive-deps

  function openExamPreview() {
    const payload: ExamPayload = {
      test: { id: '__admin_preview__', title: title || '(Chưa có tiêu đề)', skill: type, is_free: isFree },
      passages: passages.map((p) => ({ id: p.id, title: p.title, ...(p.subtitle?.trim() ? { subtitle: p.subtitle.trim() } : {}), content: p.content })),
      questions: questions.map(emitQuestion), // rich fields (options/instruction/image/x/y) để preview đúng format thi
      audio_url: null, // audio ký URL chỉ sau access guard — preview không phát audio
    }
    setExamPreview({ payload, durationSec: Math.max(1, Number(durationMin) || 60) * 60 })
  }

  const setP = (i: number, patch: Partial<Passage>) => setPassages((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const setQ = (i: number, patch: Partial<QField>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))

  // Nhập đáp án hàng loạt: 1 dòng = đáp án cho 1 câu THEO THỨ TỰ trên form (dòng 1 → câu đầu).
  //   Trong 1 dòng vẫn dùng dấu phẩy cho nhiều đáp án chấp nhận (giữ convention ô đáp án lẻ).
  //   Dòng trống = giữ nguyên đáp án hiện có của câu đó (không xoá nhầm).
  function openBulkAnswers() {
    setBulkAnsText(questions.map((q) => q.answers).join('\n')) // prefill đáp án hiện có để rà/sửa
    setBulkAnsMsg('')
    setShowBulkAns(true)
  }
  function applyBulkAnswers() {
    const lines = bulkAnsText.replace(/\r/g, '').split('\n')
    const n = questions.length
    const applied = lines.slice(0, n).filter((l) => l.trim() !== '').length
    const extra = lines.slice(n).filter((l) => l.trim() !== '').length
    setQuestions((qs) =>
      qs.map((q, i) => {
        const line = (lines[i] ?? '').trim()
        return line === '' ? q : { ...q, answers: line }
      }),
    )
    setBulkAnsMsg(
      `✓ Đã điền ${applied}/${n} câu.` +
        (extra > 0 ? ` ⚠️ Thừa ${extra} dòng cuối (form chỉ có ${n} câu) — bấm "+ Thêm câu hỏi" rồi áp dụng lại.` : ''),
    )
  }

  // Tạo nhanh nhiều hàng cùng bank + hướng dẫn: câu hiện tại thành hàng 1, mỗi dòng còn lại thêm 1 hàng dưới.
  //   Dòng "statement | đáp án" gán luôn đáp án. Số câu tự tăng từ số của câu hiện tại. Options CLONE riêng mỗi hàng.
  function bulkRows(i: number, qid: string, text: string) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return
    setQuestions((qs) => {
      const base = qs[i]
      if (!base) return qs
      const start = Number(base.number) || i + 1
      const rows: QField[] = lines.map((line, k) => {
        const cut = line.lastIndexOf('|')
        const prompt = cut >= 0 ? line.slice(0, cut).trim() : line
        const answers = cut >= 0 ? line.slice(cut + 1).trim() : ''
        return {
          ...base,
          id: k === 0 ? base.id : uid('q'),
          number: String(start + k),
          prompt,
          answers,
          options: (base.options ?? []).map((o) => ({ ...o })),
          explanation: k === 0 ? base.explanation : undefined,
          evidence: k === 0 ? base.evidence : undefined,
          evidence_occurrence: k === 0 ? base.evidence_occurrence : undefined,
          evidence_context_before: k === 0 ? base.evidence_context_before : undefined,
          evidence_context_after: k === 0 ? base.evidence_context_after : undefined,
        }
      })
      const next = [...qs]
      next.splice(i, 1, ...rows)
      return next
    })
    setBulkText((m) => ({ ...m, [qid]: '' }))
  }

  function buildPayload() {
    // ⚠️ questions KHÔNG mang đáp án; đáp án + explanation → answer_keys (tách, server-only).
    const qOut = questions.map(emitQuestion)
    type EvidenceObj = { quote: string; occurrence?: number; context_before?: string; context_after?: string }
    type KeyEntry = { answers: string[]; match: 'ci'; points: number; type?: string; explanation?: string; evidence?: string | EvidenceObj }
    const answer_keys: Record<string, KeyEntry> = {}
    for (const q of questions) {
      const ans = q.answers.split(',').map((s) => s.trim()).filter(Boolean)
      // Entry BẮT BUỘC có answers (AnswerKeyEntrySchema.min(1)); explanation/evidence chỉ đính khi đã có đáp án.
      if (!ans.length) continue
      const entry: KeyEntry = { answers: ans, match: 'ci', points: Number(q.points) || 1 }
      const kt = KEY_TYPE[q.type]
      if (kt) entry.type = kt // mcq_multi chấm theo SET; diagram/map single-value đúng nhãn
      const exp = q.explanation?.trim()
      if (exp) entry.explanation = exp
      const ev = q.evidence?.trim()
      if (ev) {
        // EXAM-006: có occurrence/context → lưu dạng object (khử trùng); không → string legacy (gọn).
        const occ = Number(q.evidence_occurrence)
        const cb = q.evidence_context_before?.trim()
        const ca = q.evidence_context_after?.trim()
        if ((Number.isInteger(occ) && occ > 0) || cb || ca) {
          const obj: EvidenceObj = { quote: ev.slice(0, 2000) }
          if (Number.isInteger(occ) && occ > 0) obj.occurrence = occ
          if (cb) obj.context_before = cb.slice(0, 200)
          if (ca) obj.context_after = ca.slice(0, 200)
          entry.evidence = obj
        } else {
          entry.evidence = ev.slice(0, 2000)
        }
      }
      answer_keys[q.id] = entry
    }
    // AI-006: writing → ép id passage về task1/task2 NGAY LÚC LƯU. Form sinh uid('p') không bao giờ
    //   trùng 'task1' → runtime rơi về khớp VỊ TRÍ, đảo/thêm/xoá passage là tráo đề Task 1 ↔ Task 2
    //   âm thầm. Passage ĐÃ mang id task giữ nguyên (id thắng vị trí) — xem lib/exam/writing-prompts.ts.
    const pOut = passages.map((p) => ({ id: p.id, title: p.title, ...(p.subtitle?.trim() ? { subtitle: p.subtitle.trim() } : {}), ...(p.image ? { image: p.image } : {}), content: p.content }))
    return {
      title,
      type,
      slug: slug.trim() || undefined,
      is_free: isFree,
      duration_sec: Math.max(1, Number(durationMin) || 60) * 60,
      passages: type === 'writing' ? normalizeWritingPassageIds(pOut) : pOut,
      questions: qOut,
      // ADMIN-003: LUÔN gửi answer_keys (kể cả {}) → save là AUTHORITATIVE. Xoá hết đáp án → {} → server
      //   xoá key cũ (không còn stale). Bỏ trống = giữ nguyên chỉ dành cho caller không quản key.
      answer_keys,
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
    const res = applyDraft(parsed as Record<string, unknown>)
    const bits = [`nạp ${res.passages} passage · ${res.questions} câu`]
    if (res.noAnswers) bits.push(`${res.noAnswers} câu CHƯA có đáp án (gõ tay ở ô 🔒)`)
    setImportMsg({ tone: 'ok', text: `✓ Đã ${bits.join(' · ')}. Rà lại type + đáp án rồi Lưu.` })
    setShowImport(false)
    setShowPreview(true)
  }

  // Mapping chung cho import JSON + edit mode (2026-07-12): đổ object đề (kèm answer_keys nếu có)
  //   vào state form. Reverse answer_keys → ô đáp án/điểm/giải thích từng câu; chuẩn hoá type.
  function applyDraft(data: Record<string, unknown>): { passages: number; questions: number; noAnswers: number } {
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
    const mappedP: Passage[] = ps.map((raw) => {
      const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
      // OCR draft là text thuần → bọc thành <p> cho editor WYSIWYG; nếu đã là HTML thì SANITIZE (SEC-006:
      //   import có thể chứa <img onerror>/<svg onload>/script → chống XSS admin-origin trước khi vào DOM).
      const rawContent = str(p.body) || str(p.content)
      const content = rawContent && !looksRich(rawContent) ? plainToHtml(rawContent) : sanitizePassageHtmlClient(rawContent)
      const out: Passage = { id: String(p.id ?? uid('p')), title: str(p.title), content }
      if (str(p.subtitle)) out.subtitle = str(p.subtitle)
      if (str(p.image)) out.image = str(p.image) // AI-010: biểu đồ đề (server validate allowlist khi lưu)
      return out
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
      // EXAM-006: evidence có thể là string (legacy) hoặc object {quote, occurrence?, context_*}.
      if (key && typeof key.evidence === 'string') {
        out.evidence = key.evidence
      } else if (key && key.evidence && typeof key.evidence === 'object') {
        const ev = key.evidence as { quote?: unknown; occurrence?: unknown; context_before?: unknown; context_after?: unknown }
        if (typeof ev.quote === 'string') out.evidence = ev.quote
        if (typeof ev.occurrence === 'number') out.evidence_occurrence = String(ev.occurrence)
        if (typeof ev.context_before === 'string') out.evidence_context_before = ev.context_before
        if (typeof ev.context_after === 'string') out.evidence_context_after = ev.context_after
      }
      return out
    })

    if (mappedP.length) setPassages(mappedP)
    if (mappedQ.length) setQuestions(mappedQ)

    const noAns = mappedQ.filter((q) => !q.answers.trim()).length
    return { passages: mappedP.length, questions: mappedQ.length, noAnswers: noAns }
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
    if (type === 'writing') {
      // AI-006: writing thì passage CHÍNH LÀ đề bài — trước đây nhánh này bị BỎ QUA hoàn toàn
      //   (if type !== 'writing') → publish được đề với prompt rỗng, AI chấm với task1_prompt=''.
      //   Rỗng ở writing là ERROR, không phải warn.
      for (const text of lintWritingPrompts(passages)) out.push({ level: 'error', text })
    } else {
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
      // Edit mode: PATCH theo id (upsert nội dung + answer_keys); tạo mới: POST như cũ.
      const r = await fetch('/api/admin/tests', {
        method: testId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(testId ? { ...buildPayload(), id: testId } : buildPayload()),
      })
      const j = await r.json().catch(() => null)
      if ((testId ? r.ok : r.status === 201) && j?.data?.test_id) setCreated({ test_id: j.data.test_id, status: j.data.status })
      else if (r.status === 403) setError('Bạn không có quyền admin.')
      else setError((j?.message as string) || 'Không lưu được đề. Kiểm tra dữ liệu.')
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

  // STORE-002 — upload audio THẬT: presign PUT (R2) → PUT file → finalize (server HEAD verify → set audio_key).
  //   KHÔNG còn set audio_key ở bước presign (chống key trỏ object chưa tồn tại). Cần R2 config (Owner).
  async function uploadAudio(file: File) {
    if (!created) return
    setBusy('media')
    setMediaMsg('')
    try {
      const r = await fetch('/api/admin/media', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'audio', filename: file.name, content_type: file.type, test_id: created.test_id }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.data?.upload_url) {
        setMediaMsg(j?.meta?.error_code === 'STORAGE_NOT_CONFIGURED' ? '⚠️ R2 chưa cấu hình (audio) — cần creds R2/bucket (Owner/DevOps).' : 'Không tạo được upload URL audio.')
        return
      }
      const { upload_url, upload_ref } = j.data as { upload_url: string; upload_ref: string }
      // PUT file thật lên R2 (presigned PUT). SignedHeaders=host → content-type không ký, R2 vẫn nhận.
      const put = await fetch(upload_url, { method: 'PUT', body: file, headers: file.type ? { 'content-type': file.type } : undefined })
      if (!put.ok) { setMediaMsg('Upload audio lên R2 thất bại.'); return }
      // Finalize: server HEAD verify object tồn tại rồi MỚI set audio_key.
      const fr = await fetch('/api/admin/media/finalize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ test_id: created.test_id, upload_ref }),
      })
      const fj = await fr.json().catch(() => null)
      setMediaMsg(fr.ok && fj?.success ? '✓ Đã upload + gán audio cho đề.' : (fj?.message || 'Finalize audio thất bại.'))
    } finally {
      setBusy('')
    }
  }

  // AI-010 — Upload biểu đồ/hình kèm đề cho 1 passage (Writing Task 1): presign kind image → PUT →
  //   lưu URL vào passage state (đi cùng payload khi Lưu; server validate allowlist + strip URL lạ).
  //   Khác cover: KHÔNG PATCH riêng — ảnh là một phần nội dung đề. Ảnh cũ bị thay → orphan sweep dọn.
  async function uploadPassageImage(i: number, file: File) {
    setBusy(`pimg-${i}`)
    setMediaMsg('')
    try {
      const r = await fetch('/api/admin/media', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'image', filename: file.name, content_type: file.type, ...(created ? { test_id: created.test_id } : {}) }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.data?.upload_url) {
        setMediaMsg(j?.meta?.error_code === 'STORAGE_NOT_CONFIGURED' ? '⚠️ Supabase Storage chưa cấu hình (bucket media).' : 'Không tạo được upload URL cho ảnh đề.')
        return
      }
      const { path, token, bucket, public_url } = j.data as { path: string; token: string; bucket: string; public_url: string }
      const { error: upErr } = await createClient().storage.from(bucket).uploadToSignedUrl(path, token, file)
      if (upErr) {
        setMediaMsg(`Upload ảnh đề thất bại: ${upErr.message}`)
        return
      }
      setP(i, { image: public_url })
      setMediaMsg('✓ Đã gắn biểu đồ vào đề — nhớ bấm Lưu.')
    } catch {
      setMediaMsg('Lỗi khi upload ảnh đề.')
    } finally {
      setBusy('')
    }
  }

  // Upload ảnh minh họa đề (cover): presign → PUT file lên Supabase Storage → lưu cover_image (PATCH).
  async function uploadCover(file: File) {
    if (!created) return
    setBusy('cover')
    setMediaMsg('')
    try {
      const r = await fetch('/api/admin/media', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'image', filename: file.name, content_type: file.type, test_id: created.test_id }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.data?.upload_url) {
        setMediaMsg(
          j?.meta?.error_code === 'STORAGE_NOT_CONFIGURED'
            ? '⚠️ Supabase Storage chưa cấu hình (bucket media) — chạy migration/khởi động storage.'
            : 'Không tạo được upload URL cho ảnh.',
        )
        return
      }
      const { path, token, bucket, public_url } = j.data as { path: string; token: string; bucket: string; public_url: string }
      // PUT file thật lên signed upload URL (Supabase Storage client).
      const { error: upErr } = await createClient().storage.from(bucket).uploadToSignedUrl(path, token, file)
      if (upErr) {
        setMediaMsg(`Upload ảnh thất bại: ${upErr.message}`)
        return
      }
      // Lưu URL công khai vào tests.cover_image (meta-only PATCH).
      const pr = await fetch(`/api/admin/tests/${created.test_id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cover_image: public_url }),
      })
      if (!pr.ok) {
        setMediaMsg('Đã upload nhưng không lưu được cover_image.')
        return
      }
      setCoverUrl(public_url)
      setMediaMsg('✓ Đã cập nhật ảnh minh họa đề.')
    } catch {
      setMediaMsg('Lỗi khi upload ảnh.')
    } finally {
      setBusy('')
      if (coverInputRef.current) coverInputRef.current.value = '' // cho phép chọn lại cùng file
    }
  }

  async function removeCover() {
    if (!created) return
    setBusy('cover')
    setMediaMsg('')
    try {
      const pr = await fetch(`/api/admin/tests/${created.test_id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cover_image: null }),
      })
      if (!pr.ok) {
        setMediaMsg('Không gỡ được ảnh.')
        return
      }
      setCoverUrl(null)
      setMediaMsg('✓ Đã gỡ ảnh minh họa.')
    } finally {
      setBusy('')
    }
  }

  // Edit mode: chờ nạp xong đề cũ (tránh flash form trống); lỗi nạp → báo + đường về danh sách.
  if (editLoading || editLoadErr) {
    return (
      <div className="rounded-[20px] border border-[#E7E4EE] bg-white p-8 text-[#2A2740] shadow-[0_30px_60px_-38px_rgba(60,40,90,0.4)]">
        <Link href="/admin/tests" className="text-sm font-semibold text-[#6A48D6] underline">
          ← Danh sách đề
        </Link>
        {editLoadErr ? (
          <p className="mt-5 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{editLoadErr}</p>
        ) : (
          <p className="mt-5 text-center text-sm text-[#A8A2BA]">Đang tải đề…</p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-[20px] border border-[#E7E4EE] bg-white p-6 text-[#2A2740] shadow-[0_30px_60px_-38px_rgba(60,40,90,0.4)] sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <div className="flex items-center gap-3">
            <Link href={testId ? '/admin/tests' : '/admin'} className="text-sm font-semibold text-[#6A48D6] underline">
              {testId ? '← Danh sách đề' : '← Dashboard'}
            </Link>
            <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">{testId ? 'Sửa đề' : 'Tạo đề mới'}</h1>
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
            <AutoGrowTextarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              minHeight={120}
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
            onClick={() => setPassages((ps) => [...ps, { id: uid('p'), title: '', content: '' }])}
            className="text-[12.5px] font-bold text-[#6A48D6]"
          >
            + Thêm passage
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {passages.map((p, i) => (
            <div key={p.id} className="rounded-[13px] border border-[#E4DEEE] bg-white p-4">
              <div className="flex items-center gap-2">
                <input className={inputCls} value={p.title} onChange={(e) => setP(i, { title: e.target.value })} placeholder="Nhãn passage cho thanh chuyển (VD: Passage 1) — không hiển thị trong bài đọc" />
                {passages.length > 1 && (
                  <button type="button" onClick={() => setPassages((ps) => ps.filter((_, j) => j !== i))} className="text-[12.5px] font-bold text-[#D08585]">
                    Xoá
                  </button>
                )}
              </div>
              {/* AI-010: biểu đồ/hình kèm đề — chỉ Writing (Passage i = đề Task i+1). data-passage-image cho gate. */}
              {type === 'writing' && (
                <div className="mt-2 flex items-center gap-3" data-passage-image>
                  {p.image ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image} alt={`Biểu đồ đề Task ${i + 1}`} className="h-16 rounded-[8px] border border-[#E4DEEE]" />
                      <button type="button" onClick={() => setP(i, { image: undefined })} className="text-[12.5px] font-bold text-[#D08585]">
                        Gỡ biểu đồ
                      </button>
                    </>
                  ) : (
                    <label className="cursor-pointer text-[12.5px] font-bold text-[#6A48D6]">
                      {busy === `pimg-${i}` ? 'Đang upload…' : `🖼 Thêm biểu đồ/hình cho đề Task ${i + 1}`}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={busy !== ''}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) uploadPassageImage(i, f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
              {/* Soạn nội dung passage kiểu Word (WYSIWYG): tiêu đề/phụ đề/đoạn/đậm-nghiêng/căn lề/danh sách bằng
                  nút bấm. Xuất HTML → server sanitize allowlist trước khi tới thí sinh. Dán từ Word được dọn sạch. */}
              <div className="mt-2">
                <RichTextEditor
                  value={p.content}
                  onChange={(html) => setP(i, { content: html })}
                  placeholder="Soạn nội dung bài đọc ở đây. Dùng nút 'Tiêu đề' / 'Phụ đề' cho 2 dòng đầu (căn giữa), rồi gõ hoặc dán các đoạn ở dưới."
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* questions builder */}
      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-[14px] font-extrabold text-[#2A2740]">Câu hỏi &amp; đáp án</div>
          <div className="flex items-center gap-3.5">
            <button type="button" onClick={showBulkAns ? () => setShowBulkAns(false) : openBulkAnswers} className="text-[12.5px] font-bold text-[#6A48D6]">
              {showBulkAns ? '× Đóng nhập nhanh' : '⚡ Nhập đáp án hàng loạt'}
            </button>
            <button
              type="button"
              onClick={() => setQuestions((qs) => [...qs, { id: uid('q'), number: String(qs.length + 1), type: 'gap_filling', prompt: '', answers: '', points: '1' }])}
              className="text-[12.5px] font-bold text-[#6A48D6]"
            >
              + Thêm câu hỏi
            </button>
          </div>
        </div>

        {/* Nhập đáp án hàng loạt: 1 dòng = 1 câu theo thứ tự form. Ô này cũng server-only như ô đáp án lẻ. */}
        {showBulkAns && (
          <div className="mb-3 rounded-[13px] border border-[#CDE8D9] bg-[#F4FBF7] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-[#1E9E63]">🔒 Đáp án hàng loạt (server)</span>
              <span className="text-[11.5px] font-semibold text-[#857F96]">{questions.length} câu trên form</span>
            </div>
            <p className="mt-1.5 text-[12.5px] font-medium leading-[1.5] text-[#6A6480]">
              Mỗi dòng là đáp án cho 1 câu <b>theo thứ tự trên form</b> (dòng 1 → câu 1). Nhiều đáp án chấp nhận
              trong cùng câu: cách nhau dấu phẩy (VD: <code className="rounded bg-white px-1 font-mono">seven, 7</code>).
              Dòng trống = giữ nguyên đáp án hiện có.
            </p>
            <textarea
              className="mt-2.5 w-full rounded-[10px] border border-[#D6EDE0] bg-white px-3 py-2.5 font-mono text-[13px] leading-[1.7] text-[#157A4B] outline-none focus:border-[#1E9E63]"
              rows={Math.min(Math.max(questions.length + 1, 6), 16)}
              value={bulkAnsText}
              onChange={(e) => setBulkAnsText(e.target.value)}
              placeholder={'A\nB\nseven, 7\nTRUE\n…'}
              spellCheck={false}
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <button type="button" onClick={applyBulkAnswers} className="rounded-[10px] bg-[#1E9E63] px-4 py-2 text-[13px] font-bold text-white transition hover:bg-[#17824F]">
                Áp dụng vào các câu ↓
              </button>
              {bulkAnsMsg && <span className="text-[12.5px] font-semibold text-[#3B7A5C]">{bulkAnsMsg}</span>}
            </div>
          </div>
        )}
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
                        {TYPE_LABEL[t] ?? t}
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
                    {passages.map((p, pi) => (
                      <option key={p.id} value={p.id}>
                        {p.title || `Passage ${pi + 1}`}
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

                    {/* Tạo nhanh nhiều hàng (matching): nhập bank + hướng dẫn 1 lần rồi dán danh sách statement → 1 click ra hết hàng */}
                    {BULK_TYPES.has(q.type) && (
                      <div className="mt-3 border-t border-[#F1E4C8] pt-2.5">
                        <div className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-[#A87614]">
                          ⚡ Tạo nhanh nhiều hàng — dùng chung bank + hướng dẫn của câu này
                        </div>
                        <textarea
                          value={bulkText[q.id] ?? ''}
                          onChange={(e) => setBulkText((m) => ({ ...m, [q.id]: e.target.value }))}
                          rows={4}
                          placeholder={'Mỗi dòng = 1 hàng (statement). Thêm " | đáp án" để gán luôn đáp án.\nsupport for an earlier finding… | B\ncriticism of the way… | D'}
                          className="mt-1.5 w-full rounded-[8px] border border-[#F1E4C8] bg-white px-3 py-2 text-[13px] leading-[1.5] text-[#2A2740] outline-none"
                        />
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => bulkRows(i, q.id, bulkText[q.id] ?? '')}
                            className="rounded-[8px] bg-[#A87614] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#8A6410]"
                          >
                            Tạo hàng từ danh sách →
                          </button>
                          <span className="text-[11px] font-semibold text-[#9C8A5E]">
                            Câu này thành hàng 1; đặt “Số câu” = số bắt đầu (VD 14) trước khi bấm — các hàng tự đánh số tiếp.
                          </span>
                        </div>
                      </div>
                    )}
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
                    <AutoGrowTextarea
                      className="mt-1 w-full rounded-[8px] border border-[#D6EFE0] bg-white px-3 py-2 text-[12.5px] leading-[1.5] text-[#2A2740] outline-none"
                      minHeight={64}
                      value={q.explanation ?? ''}
                      onChange={(e) => setQ(i, { explanation: e.target.value || undefined })}
                      placeholder="Giải thích/dịch nghĩa → hiện ở khối 'Giải thích chi tiết' trang kết quả. Bỏ trống nếu chưa có."
                    />
                  </div>
                  {/* Evidence (2026-07-12) — trích NGUYÊN VĂN từ passage → chế độ 'Xem lại trong bài'
                      tự tìm text-match để highlight xanh + gắn số câu [n] trong bài đọc. */}
                  <div className="mt-2.5">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-[#157A4B]">📍 Evidence (trích nguyên văn từ passage)</span>
                    <AutoGrowTextarea
                      className="mt-1 w-full rounded-[8px] border border-[#D6EFE0] bg-white px-3 py-2 text-[12.5px] leading-[1.5] text-[#2A2740] outline-none"
                      minHeight={48}
                      value={q.evidence ?? ''}
                      onChange={(e) => setQ(i, { evidence: e.target.value || undefined })}
                      placeholder="Copy đúng câu trong passage chứa đáp án — sẽ được highlight + đánh số khi thí sinh 'Xem lại trong bài'. Sai 1 chữ = không tìm thấy (không highlight)."
                    />
                    {/* EXAM-006: khử trùng nếu quote lặp trong passage. Bỏ trống nếu quote chỉ xuất hiện 1 lần.
                        Nếu quote lặp mà KHÔNG điền ở đây → hệ thống bỏ qua (không tô nhầm lần đầu). */}
                    <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                      <input
                        type="number"
                        min={1}
                        className="rounded-[8px] border border-[#D6EFE0] bg-white px-2.5 py-1.5 text-[12px] text-[#2A2740] outline-none"
                        value={q.evidence_occurrence ?? ''}
                        onChange={(e) => setQ(i, { evidence_occurrence: e.target.value || undefined })}
                        placeholder="Lần thứ mấy (nếu quote lặp)"
                      />
                      <input
                        className="rounded-[8px] border border-[#D6EFE0] bg-white px-2.5 py-1.5 text-[12px] text-[#2A2740] outline-none"
                        value={q.evidence_context_before ?? ''}
                        onChange={(e) => setQ(i, { evidence_context_before: e.target.value || undefined })}
                        placeholder="Vài chữ ngay TRƯỚC (tùy chọn)"
                      />
                      <input
                        className="rounded-[8px] border border-[#D6EFE0] bg-white px-2.5 py-1.5 text-[12px] text-[#2A2740] outline-none"
                        value={q.evidence_context_after ?? ''}
                        onChange={(e) => setQ(i, { evidence_context_after: e.target.value || undefined })}
                        placeholder="Vài chữ ngay SAU (tùy chọn)"
                      />
                    </div>
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
                    {p.subtitle?.trim() && <div className="text-[12.5px] italic text-[#857F96]">{p.subtitle}</div>}
                    {p.content.trim() ? (
                      looksRich(p.content) ? (
                        // SEC-006: sanitize lần nữa ngay tại sink preview (phòng content chưa qua applyDraft).
                        <div className="dcx-rich mt-1.5 text-[13.5px] leading-[1.7] text-[#3B364A]" dangerouslySetInnerHTML={{ __html: sanitizePassageHtmlClient(p.content) }} />
                      ) : (
                        <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-[1.7] text-[#3B364A]">{p.content}</p>
                      )
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

      {/* footer actions — edit mode giữ nút Lưu (PATCH) song song panel publish/media */}
      {(!created || testId) && (
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={submit}
            disabled={phase === 'submitting' || !title}
            className="ml-auto rounded-[11px] bg-[#7C5CE6] px-6 py-3 text-[14.5px] font-bold text-white shadow-[0_12px_24px_-10px_rgba(124,92,230,0.45)] transition hover:bg-[#6A48D6] disabled:cursor-not-allowed disabled:bg-[#D8D2E4]"
          >
            {phase === 'submitting' ? 'Đang lưu…' : testId ? 'Lưu thay đổi →' : 'Lưu đề (draft) →'}
          </button>
        </div>
      )}
      {created && (
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
            <label className={`cursor-pointer rounded-[11px] bg-[#F4F1FB] px-4 py-2.5 text-sm font-bold text-[#2A2740] hover:bg-[#EAE4F6] ${busy === 'media' ? 'opacity-60' : ''}`}>
              {busy === 'media' ? 'Đang upload…' : 'Upload audio'}
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                disabled={busy === 'media'}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadAudio(f) }}
              />
            </label>
          </div>

          {/* Ảnh minh họa đề (cover) — hiện ở trang pre-exam /tests/[id] */}
          <div className="mt-4 rounded-[12px] border border-[#E8E2F2] bg-white p-3.5">
            <p className="text-[13px] font-bold text-[#2A2740]">Ảnh minh họa đề (cover)</p>
            <p className="mt-0.5 text-[12px] font-medium text-[#857F96]">Hiện trên đầu trang vào đề. PNG/JPG/WebP, ≤ 5MB. Không có ảnh → dùng nền trang trí theo kỹ năng.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3.5">
              <div className="flex h-[68px] w-[120px] flex-none items-center justify-center overflow-hidden rounded-[10px] border border-[#EEEAF3] bg-[#FAF8FF]">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt="cover" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[11px] font-semibold text-[#B4ADC4]">Chưa có ảnh</span>
                )}
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void uploadCover(f)
                }}
              />
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={busy === 'cover'}
                className="rounded-[11px] bg-[#7C5CE6] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A48D6] disabled:bg-[#D8D2E4]"
              >
                {busy === 'cover' ? 'Đang tải…' : coverUrl ? 'Đổi ảnh…' : 'Chọn ảnh…'}
              </button>
              {coverUrl && (
                <button
                  type="button"
                  onClick={removeCover}
                  disabled={busy === 'cover'}
                  className="rounded-[11px] border border-[#E4DEEE] bg-white px-4 py-2.5 text-sm font-bold text-[#564F6B] transition hover:border-[#CCC3DC] disabled:opacity-50"
                >
                  Gỡ ảnh
                </button>
              )}
            </div>
          </div>

          {mediaMsg && <p className="mt-2 text-xs text-[#6A6480]">{mediaMsg}</p>}
          {preview && (
            <pre className="mt-3 max-h-72 overflow-auto rounded-[10px] bg-[#2A2740] p-3 text-xs text-slate-100">{JSON.stringify(preview, null, 2)}</pre>
          )}
        </div>
      )}

      {/* Preview giao diện thi thật (fullscreen overlay) — ExamRunner preview mode, KHÔNG API/attempt */}
      {examPreview && (
        <div className="dcx-exam-preview fixed inset-0 z-[100] bg-[#F4F1F8]">
          <button
            type="button"
            onClick={() => setExamPreview(null)}
            className="fixed right-4 top-3 z-[110] rounded-[11px] bg-[#2A2740] px-4 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-[#17152A]"
          >
            ✕ Đóng preview
          </button>
          <div className={`${examFontVars} h-full`}>
            <ExamRunner testId="__admin_preview__" preview={examPreview} />
          </div>
        </div>
      )}
    </div>
  )
}
