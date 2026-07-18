'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AttemptDTO, ExamPayload, ReviewItem, SubmitResult } from '@/types/exam'
import { QuestionRenderer } from '@/components/exam/questions/QuestionRenderer'
import { MatchingMatrixQuestion } from '@/components/exam/questions/MatchingMatrixQuestion'
import { SummaryQuestion } from '@/components/exam/questions/SummaryQuestion'
import { MatchingBankQuestion } from '@/components/exam/questions/MatchingBankQuestion'
import { ListeningAudioPlayer } from '@/components/exam/ListeningAudioPlayer'
import { Mascot } from '@/components/brand/Mascot'
import {
  ClockIcon,
  MenuIcon,
  CloseIcon,
  CheckIcon,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  PencilIcon,
  NoteIcon,
  TrashIcon,
  ContrastIcon,
  FlagIcon,
} from '@/components/exam/ExamIcons'
import { A11yDialog } from '@/components/a11y/A11yDialog'
import { isAnswered, renderKindOf, type AnswerValue, type ExamQuestion, type QOption } from '@/components/exam/questions/types'
import {
  anchorFromRange,
  applyEvidenceHighlights,
  applyHighlights,
  clearEvidenceHighlights,
  clearHighlights,
  evidenceMarkerPositions,
  highlightAtPoint,
  newAnchorId,
  noteMarkerPositions,
  rangeWithinRoot,
  type HighlightAnchor,
} from '@/lib/exam/highlight-anchor'

// Shape payload (BE trả `unknown` → cast + guard). KHÔNG có đáp án đúng (guard server).
type Passage = { id: string; number?: number; title?: string; subtitle?: string; content?: string }
// Passage content là HTML rich (admin soạn WYSIWYG, đã sanitize server) hay plain text? → chọn nhánh render.
//   Chỉ nhận diện thẻ trong allowlist (khớp lib/sanitize/passage-html) → tránh false-positive "a < b".
const RICH_RE = /<(\/?)(p|br|strong|b|em|i|u|s|h2|h3|ul|ol|li|span|div)(\s|>|\/)/i

// W9 parity (capture): +'instructions' — màn "Hướng dẫn làm bài kiểm tra" trước khi vào active.
type Phase = 'loading' | 'locked' | 'notfound' | 'error' | 'instructions' | 'active' | 'submitting' | 'done'
type Contrast = 'bw' | 'wb' | 'yb' // Black-on-white / White-on-black / Yellow-on-black
type TextSize = 'small' | 'regular' | 'large' // Nhỏ / Vừa / Lớn

// W9 — nhóm câu theo passage (Reading) / section (Listening) để switch như reference.
type ExamGroup = { key: string | null; passages: Passage[]; questions: ExamQuestion[] }

const CONTRAST_KEY = 'dc-exam:contrast'
const TEXTSIZE_KEY = 'dc-exam:textSize'

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

// Gom câu theo passage_id ?? section_id. ≤1 key → 1 group (legacy: all passages + all questions).
function buildGroups(passages: Passage[], questions: ExamQuestion[]): ExamGroup[] {
  const keyOf = (q: ExamQuestion): string | null => q.passage_id ?? q.section_id ?? null
  const keys: (string | null)[] = []
  for (const q of questions) {
    const k = keyOf(q)
    if (!keys.includes(k)) keys.push(k)
  }
  if (keys.length <= 1) return [{ key: keys[0] ?? null, passages, questions }]
  return keys.map((k, idx) => {
    const gq = questions.filter((q) => keyOf(q) === k)
    let gp = passages.filter((p) => p.id === k)
    if (gp.length === 0 && passages[idx]) gp = [passages[idx]] // fallback align theo thứ tự (listening sections)
    return { key: k, passages: gp, questions: gq }
  })
}

// Choose TWO/THREE (mcq_multi) is ONE item that stands for a range of numbers → e.g. "24–26".
const isRangeQ = (q: ExamQuestion): boolean =>
  (q.type ?? '').toLowerCase() === 'mcq_multi' && typeof q.select_count === 'number' && q.select_count > 1
const qEnd = (q: ExamQuestion): number => (typeof q.number === 'number' ? q.number + (isRangeQ(q) ? (q.select_count as number) - 1 : 0) : NaN)
function qNumberLabel(q: ExamQuestion, fallback: number): string {
  const n = typeof q.number === 'number' ? q.number : fallback
  return isRangeQ(q) ? `${n}–${n + (q.select_count as number) - 1}` : `${n}`
}
function rangeLabel(qs: ExamQuestion[]): string {
  const nums = qs.map((q) => q.number).filter((n): n is number => typeof n === 'number')
  if (nums.length === 0) return ''
  const a = Math.min(...nums)
  const b = Math.max(...qs.map(qEnd).filter((n) => !Number.isNaN(n))) // extend for Choose TWO/THREE ranges
  return a === b ? `${a}` : `${a}–${b}`
}

// W9 (T3.1) — gom câu cùng dạng liên tiếp thành 1 khối: matrix (matching_information), summary (đoạn nhiều ô),
//   matchbank (matching_features: bank hiện rõ + ô điền); còn lại render đơn.
type RenderItem =
  | { kind: 'single'; q: ExamQuestion }
  | { kind: 'matrix'; qs: ExamQuestion[]; options: QOption[] }
  | { kind: 'summary'; qs: ExamQuestion[]; template: string; options?: QOption[] }
  | { kind: 'matchbank'; qs: ExamQuestion[]; options: QOption[] }
const typeOf = (q: ExamQuestion): string => (q.type ?? '').toLowerCase().trim()
const isMatchingInfo = (q: ExamQuestion): boolean => typeOf(q) === 'matching_information'
const isSummary = (q: ExamQuestion): boolean => typeOf(q) === 'summary' || typeOf(q) === 'summary_completion'
const isMatchFeatures = (q: ExamQuestion): boolean => typeOf(q) === 'matching_features'
const optionsSig = (opts?: QOption[]): string => (Array.isArray(opts) ? opts.map((o) => o.key).join('|') : '')
const markerCount = (s?: string): number => (s ? (s.match(/\[\d+\]/g)?.length ?? 0) : 0)
function buildRenderItems(qs: ExamQuestion[]): RenderItem[] {
  const items: RenderItem[] = []
  let i = 0
  while (i < qs.length) {
    const q = qs[i]
    // Summary: gom câu 'summary' liên tiếp → 1 đoạn nhiều ô. template = prompt có nhiều marker [n] nhất.
    if (isSummary(q)) {
      const grp = [q]
      let j = i + 1
      while (j < qs.length && isSummary(qs[j])) {
        grp.push(qs[j])
        j++
      }
      const template = grp.reduce((best, g) => (markerCount(g.prompt) > markerCount(best) ? (g.prompt ?? '') : best), '')
      // Word-bank (A–G) nếu có → SummaryQuestion render bank kéo-thả; không có → ô gõ chữ thường.
      const options = grp.find((g) => Array.isArray(g.options) && g.options.length > 0)?.options
      items.push({ kind: 'summary', qs: grp, template, options })
      i = j
      continue
    }
    // Matching features: bank hiện rõ + ô điền chữ (option dài). Gom ≥1 câu liên tiếp cùng bank.
    if (isMatchFeatures(q) && Array.isArray(q.options) && q.options.length > 0) {
      const sig = optionsSig(q.options)
      const grp = [q]
      let j = i + 1
      while (j < qs.length && isMatchFeatures(qs[j]) && optionsSig(qs[j].options) === sig) {
        grp.push(qs[j])
        j++
      }
      items.push({ kind: 'matchbank', qs: grp, options: q.options })
      i = j
      continue
    }
    // Matrix: matching_information (≥2 câu liên tiếp cùng pool options).
    if (isMatchingInfo(q) && Array.isArray(q.options) && q.options.length > 0) {
      const sig = optionsSig(q.options)
      const grp = [q]
      let j = i + 1
      while (j < qs.length && isMatchingInfo(qs[j]) && optionsSig(qs[j].options) === sig) {
        grp.push(qs[j])
        j++
      }
      if (grp.length >= 2) {
        items.push({ kind: 'matrix', qs: grp, options: q.options })
        i = j
        continue
      }
    }
    items.push({ kind: 'single', q })
    i++
  }
  return items
}

// Passage render TÁCH RIÊNG + memo: React 19 set lại innerHTML của dangerouslySetInnerHTML mỗi khi
//   object {__html} đổi identity (commitUpdate không so sánh chuỗi __html) — mà timer tick re-render
//   mỗi giây ⇒ children passage bị thay mới liên tục ⇒ mọi Range của CSS Highlight API collapse
//   ⇒ highlight vẽ xong biến mất ngay (bug "Highlight không hoạt động" trên passage rich HTML).
//   memo + prop `passage` ổn định (từ payload) ⇒ subtree bail-out, DOM passage BẤT BIẾN giữa các
//   render — điều kiện sống của anchor node-path (W8/W9) và của chính CSS Highlight ranges.
const PassageArticle = memo(function PassageArticle({ passage }: { passage: Passage }) {
  const raw = passage.content ?? ''
  // Rich: HTML admin soạn WYSIWYG (đã sanitize server, cả lúc lưu lẫn lúc trả) → render trực tiếp,
  //   giữ heading/căn lề/danh sách admin đặt. Highlight neo node-path+quote vẫn chạy trên text node.
  if (RICH_RE.test(raw)) {
    return (
      <article style={{ marginBottom: 20 }}>
        <div className="dcx-rich rtext" dangerouslySetInnerHTML={{ __html: raw }} />
      </article>
    )
  }
  // Legacy plain text: tiêu đề/phụ đề căn giữa + tách đoạn thụt đầu dòng như bản in (.dcx-para).
  const paras = raw.split(/\n{2,}|\n/).map((s) => s.trim()).filter(Boolean)
  return (
    <article style={{ marginBottom: 20 }}>
      {passage.title && <div className="dcx-passage-title">{passage.title}</div>}
      {passage.subtitle && <div className="dcx-passage-sub">{passage.subtitle}</div>}
      {paras.length > 0 ? (
        paras.map((para, k) => (
          <p key={k} className="rtext dcx-para" style={{ textAlign: 'justify' }}>
            {para}
          </p>
        ))
      ) : (
        <p className="rtext" style={{ whiteSpace: 'pre-line', textAlign: 'justify' }}>
          {raw}
        </p>
      )}
    </article>
  )
})

// Capture parity: instruction tự BOLD các cụm IN HOA (vd "ONE WORD ONLY", "NO MORE THAN TWO WORDS").
function InstructionText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\b[A-Z]{2,}(?:[ /-][A-Z]{2,})*\b)/g)
  return (
    <p className={className}>
      {parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}
    </p>
  )
}

// W9 parity (capture): block câu hỏi theo `instruction` liên tiếp → header "Questions a–b" + instruction 1 lần.
type QBlock = { instruction?: string; qs: ExamQuestion[]; items: RenderItem[] }
function buildBlocks(qs: ExamQuestion[]): QBlock[] {
  const raw: { instruction?: string; qs: ExamQuestion[] }[] = []
  for (const q of qs) {
    const ins = (q.instruction ?? '').trim() || undefined
    const last = raw[raw.length - 1]
    if (last && (last.instruction ?? '') === (ins ?? '')) last.qs.push(q)
    else raw.push({ instruction: ins, qs: [q] })
  }
  return raw.map((b) => ({ ...b, items: buildRenderItems(b.qs) }))
}

// `preview` (admin authoring, 2026-07-08): render payload LOCAL trong giao diện thi thật để soát định
//   dạng đề — KHÔNG start attempt, KHÔNG fetch payload, KHÔNG API nào được gọi (submit/autosave/
//   annotation đều guard `!attempt`, attempt luôn null ở preview). Timer hiển thị tĩnh, không đếm.
// `review` (2026-07-12): xem lại bài ĐÃ NỘP trong giao diện thi thật — đáp án ĐÚNG điền sẵn (read-only),
//   evidence highlight xanh + badge số câu trong passage, nav pill tô đúng/sai theo is_correct.
//   Không attempt/timer/submit; highlight thí sinh (nếu trang truyền) chỉ hiển thị, không sửa được.
export function ExamRunner({
  testId,
  preview,
  review,
}: {
  testId: string
  preview?: { payload: ExamPayload; durationSec: number }
  review?: { payload: ExamPayload; items: ReviewItem[]; attemptId: string; highlights?: HighlightAnchor[]; contentStale?: boolean }
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [attempt, setAttempt] = useState<AttemptDTO | null>(null)
  const [payload, setPayload] = useState<ExamPayload | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [remaining, setRemaining] = useState<number | null>(null)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  // EXAM-004: bài bị cập nhật ở tab/thiết bị khác → hiện banner non-destructive "Tải lại" (không mất đáp án).
  const [staleConflict, setStaleConflict] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [showPassage, setShowPassage] = useState(true)
  const [contrast, setContrast] = useState<Contrast>('bw')
  const [textSize, setTextSize] = useState<TextSize>('regular')
  const [optionsOpen, setOptionsOpen] = useState(false)
  // W9 annotation
  const [highlights, setHighlights] = useState<HighlightAnchor[]>([])
  const [bookmarkedQs, setBookmarkedQs] = useState<string[]>([])
  const [hlPopup, setHlPopup] = useState<{ x: number; y: number; anchor: HighlightAnchor } | null>(null)
  const [editPopup, setEditPopup] = useState<{ x: number; y: number; anchor: HighlightAnchor } | null>(null)
  const [noteMarkers, setNoteMarkers] = useState<{ id: string; left: number; top: number }[]>([])
  const [evMarkers, setEvMarkers] = useState<{ number: number; left: number; top: number }[]>([]) // review: badge [n] evidence
  // Tier0: tỉ lệ chia 2 cột (divider kéo) + cờ desktop (chỉ kéo trên lg).
  const [splitPct, setSplitPct] = useState(50)
  const [isLg, setIsLg] = useState(false)
  // W9 passage switching + nav
  const [activeGroup, setActiveGroup] = useState(0)
  const [activeQid, setActiveQid] = useState<string | null>(null)

  const baseRemainingRef = useRef<number>(-1)
  const loadAtRef = useRef<number>(0)
  const submittingRef = useRef(false)
  const autoSubmittedRef = useRef(false)
  const passageRootRef = useRef<HTMLDivElement | null>(null)
  const answerSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // EXAM-004: rev optimistic-concurrency — seed từ /start, cập nhật sau mỗi autosave thắng, gửi kèm mọi
  //   autosave/submit làm expected_rev. Server lệch rev (tab khác đã lưu mới hơn) → 409 ANSWERS_STALE.
  const answersRevRef = useRef(0)
  const scrollPendingRef = useRef<string | null>(null) // Tier0: cuộn tới câu sau khi ◀▶ đổi group
  const mainRef = useRef<HTMLElement | null>(null) // Tier0: đo bề rộng để kéo divider

  const passages = (Array.isArray(payload?.passages) ? payload?.passages : []) as Passage[]
  const questions = (Array.isArray(payload?.questions) ? payload?.questions : []) as ExamQuestion[]
  const answeredCount = questions.filter((q) => isAnswered(answers[q.id])).length

  // Review: tra cứu is_correct/evidence theo qid (đáp án đúng đã điền vào `answers` lúc boot).
  const reviewByQid = useMemo(() => {
    const m = new Map<string, ReviewItem>()
    for (const it of review?.items ?? []) m.set(it.question_id, it)
    return m
  }, [review])

  const groups = useMemo(() => buildGroups(passages, questions), [payload]) // eslint-disable-line react-hooks/exhaustive-deps
  const active = groups[activeGroup] ?? groups[0]
  const activeKey = active?.key ?? null
  const isListening = payload?.test.skill === 'listening'
  const sectionLabel = isListening ? 'Section' : 'Passage'
  // Capture parity: block theo instruction (header "Questions a–b"); matrix gom trong block.
  const blocks = useMemo(() => buildBlocks(active?.questions ?? []), [active])
  // Tier0: danh sách câu phẳng (mọi group) để ◀▶ chuyển tuần tự, vượt passage.
  const flatQs = useMemo(() => groups.flatMap((g, gi) => g.questions.map((q) => ({ id: q.id, gi }))), [groups])
  const curFlatIdx = activeQid ? flatQs.findIndex((x) => x.id === activeQid) : -1
  const goToFlat = useCallback(
    (idx: number) => {
      const t = flatQs[idx]
      if (!t) return
      scrollPendingRef.current = t.id
      setActiveGroup(t.gi)
      setActiveQid(t.id)
    },
    [flatQs],
  )

  // Persist contrast/text-size (README): đọc lúc mount, ghi khi đổi.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const c = window.localStorage.getItem(CONTRAST_KEY)
    if (c === 'bw' || c === 'wb' || c === 'yb') setContrast(c)
    const t = window.localStorage.getItem(TEXTSIZE_KEY)
    if (t === 'small' || t === 'regular' || t === 'large') setTextSize(t)
  }, [])
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(CONTRAST_KEY, contrast)
  }, [contrast])
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(TEXTSIZE_KEY, textSize)
  }, [textSize])

  // Tier0: theo dõi breakpoint lg (chỉ chia cột + kéo divider trên desktop).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 1024px)')
    const apply = () => setIsLg(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Tier0: kéo divider để đổi tỉ lệ 2 cột (clamp 28–72%).
  const onDividerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const main = mainRef.current
    if (!main) return
    const rect = main.getBoundingClientRect()
    const move = (ev: PointerEvent) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100
      setSplitPct(Math.min(72, Math.max(28, pct)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [])

  // Highlight chỉ của passage đang xem (anchor node-path neo theo root render hiện tại).
  const visibleHighlights = useMemo(
    () => highlights.filter((h) => (h.passageId ?? null) === activeKey),
    [highlights, activeKey],
  )

  // --- Submit ---
  const doSubmit = useCallback(async () => {
    if (submittingRef.current || !attempt) return
    submittingRef.current = true
    if (answerSaveTimer.current) clearTimeout(answerSaveTimer.current)
    setModalOpen(false)
    setPhase('submitting')
    try {
      const r = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attempt_id: attempt.attempt_id, answers, expected_rev: answersRevRef.current }),
      })
      const b = await r.json().catch(() => null)
      if (r.ok && b?.success) {
        setResult(b.data as SubmitResult)
        setPhase('done')
      } else if (b?.meta?.error_code === 'ANSWERS_STALE') {
        // EXAM-004: bài đã đổi ở tab/thiết bị khác → KHÔNG nộp đè; mời tải lại lấy bản mới rồi nộp lại.
        submittingRef.current = false
        setStaleConflict(true)
        setPhase('active')
      } else {
        submittingRef.current = false
        setErrorMsg('Nộp bài thất bại, vui lòng thử lại.')
        setPhase('active')
      }
    } catch {
      submittingRef.current = false
      setErrorMsg('Lỗi kết nối khi nộp bài.')
      setPhase('active')
    }
  }, [attempt, answers])

  // --- Boot ---
  useEffect(() => {
    let alive = true
    // Review: payload + review items từ trang kết quả — điền ĐÁP ÁN ĐÚNG (read-only), không timer,
    //   vào thẳng màn active (không màn hướng dẫn). Highlight thí sinh (nếu có) chỉ để xem.
    if (review) {
      setPayload(review.payload)
      const filled: Record<string, AnswerValue> = {}
      for (const it of review.items) {
        filled[it.question_id] = it.type === 'mcq_multi' ? it.correct_answers : (it.correct_answers[0] ?? '')
      }
      setAnswers(filled)
      setHighlights(Array.isArray(review.highlights) ? review.highlights : [])
      baseRemainingRef.current = -1
      setRemaining(null)
      setPhase('active')
      return () => {
        alive = false
      }
    }
    // Preview (admin): payload local, KHÔNG attempt/API — vào màn hướng dẫn như thi thật, timer tĩnh.
    if (preview) {
      setPayload(preview.payload)
      baseRemainingRef.current = -1 // không đếm ngược
      setRemaining(preview.durationSec > 0 ? preview.durationSec : null)
      setPhase('instructions')
      return () => {
        alive = false
      }
    }
    ;(async () => {
      try {
        const sr = await fetch(`/api/exam/${testId}/start`, { method: 'POST' })
        if (!alive) return
        if (sr.status === 401) {
          router.replace(`/login?next=/exam/${testId}`)
          return
        }
        const sb = await sr.json().catch(() => null)
        if (sr.status === 403) return setPhase('locked')
        if (sr.status === 404) return setPhase('notfound')
        if (!sr.ok || !sb?.success) return setPhase('error')

        const att = sb.data as AttemptDTO
        setAttempt(att)
        answersRevRef.current = att.answers_rev ?? 0 // EXAM-004: neo rev đã thấy để optimistic-concurrency
        setHighlights(Array.isArray(att.highlights) ? (att.highlights as HighlightAnchor[]) : [])
        setBookmarkedQs(Array.isArray(att.bookmarked_qs) ? att.bookmarked_qs : [])
        if (att.status !== 'in_progress') {
          setResult({ attempt_id: att.attempt_id, status: att.status as 'submitted' | 'expired', time_spent: 0, submitted_at: '', scored: false, raw_score: null, band: null })
          return setPhase('done')
        }

        const pr = await fetch(`/api/exam/${testId}`)
        if (!alive) return
        const pb = await pr.json().catch(() => null)
        if (!pr.ok || !pb?.success) return setPhase('error')
        setPayload(pb.data as ExamPayload)
        // W9: restore draft answers (chống mất bài khi reload).
        if (att.answers && typeof att.answers === 'object') setAnswers(att.answers as Record<string, AnswerValue>)

        baseRemainingRef.current = att.duration_sec > 0 ? att.time_remaining_sec : -1
        loadAtRef.current = Date.now()
        setRemaining(att.duration_sec > 0 ? att.time_remaining_sec : null)
        // Capture parity: màn hướng dẫn trước; timer server vẫn neo từ started_at (không reset).
        setPhase('instructions')
      } catch {
        if (alive) setPhase('error')
      }
    })()
    return () => {
      alive = false
    }
  }, [testId, router, preview, review])

  // --- Timer ---
  useEffect(() => {
    if (phase !== 'active' || baseRemainingRef.current < 0) return
    const tick = () => {
      const rem = Math.max(0, baseRemainingRef.current - (Date.now() - loadAtRef.current) / 1000)
      setRemaining(rem)
      if (rem <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true
        void doSubmit()
      }
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [phase, doSubmit])

  // --- W9: warn khi rời trang lúc đang làm + có đáp án chưa nộp (review: read-only → không warn) ---
  useEffect(() => {
    if (phase !== 'active' || review) return
    const handler = (e: BeforeUnloadEvent) => {
      if (answeredCount > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [phase, answeredCount, review])

  // --- W9: khóa scroll nền khi mở modal/options ---
  useEffect(() => {
    if (modalOpen || optionsOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [modalOpen, optionsOpen])

  // --- Annotation persistence (optimistic + rollback) ---
  const persistAnnotations = useCallback(
    async (patch: { highlights?: HighlightAnchor[]; bookmarked_qs?: string[] }, rollback: () => void) => {
      if (!attempt) return
      try {
        const r = await fetch(`/api/attempts/${attempt.attempt_id}/annotations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        })
        if (!r.ok) rollback()
      } catch {
        rollback()
      }
    },
    [attempt],
  )

  // --- W9: autosave draft answers (debounce) ---
  const scheduleAnswerSave = useCallback(
    (next: Record<string, AnswerValue>) => {
      if (!attempt) return
      if (answerSaveTimer.current) clearTimeout(answerSaveTimer.current)
      answerSaveTimer.current = setTimeout(() => {
        // EXAM-004: gửi expected_rev; thành công → cập nhật rev; ANSWERS_STALE (409) → bài đã đổi ở nơi khác.
        void fetch(`/api/attempts/${attempt.attempt_id}/answers`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ answers: next, expected_rev: answersRevRef.current }),
        })
          .then(async (r) => {
            const b = await r.json().catch(() => null)
            if (r.ok && b?.success) {
              if (typeof b.data?.answers_rev === 'number') answersRevRef.current = b.data.answers_rev
            } else if (b?.meta?.error_code === 'ANSWERS_STALE') {
              setStaleConflict(true) // non-destructive: dừng đè, mời tải lại lấy bản mới
            }
          })
          .catch(() => {})
      }, 800)
    },
    [attempt],
  )

  const onAnswerChange = useCallback(
    (qid: string, v: AnswerValue) => {
      if (review) return // read-only: đáp án đúng đã điền, không cho đổi
      setAnswers((a) => {
        const next = { ...a, [qid]: v }
        scheduleAnswerSave(next)
        return next
      })
    },
    [scheduleAnswerSave, review],
  )

  // --- Selection trong passage → tạo highlight; click thường → sửa/xóa highlight (F-c) ---
  const onPassageMouseUp = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const root = passageRootRef.current
      if (!root) return
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const range = sel.getRangeAt(0)
        if (!rangeWithinRoot(root, range)) return setHlPopup(null)
        const anchor = anchorFromRange(root, range)
        if (!anchor) return setHlPopup(null)
        const rect = range.getBoundingClientRect()
        setEditPopup(null)
        return setHlPopup({ x: rect.left + rect.width / 2, y: rect.bottom, anchor })
      }
      // click thường (collapsed) → hit-test highlight; trượt → đóng popup đang mở (capture parity).
      const pt = 'changedTouches' in e ? e.changedTouches[0] : (e as React.MouseEvent)
      if (!pt) return
      const hit = highlightAtPoint(root, visibleHighlights, pt.clientX, pt.clientY)
      if (hit && hit.id) {
        setHlPopup(null)
        setEditPopup({ x: pt.clientX, y: pt.clientY, anchor: hit })
      } else {
        setHlPopup(null)
        setEditPopup(null)
      }
    },
    [visibleHighlights],
  )

  const addHighlight = useCallback(
    (note?: string) => {
      if (!hlPopup) return
      const a: HighlightAnchor = {
        ...hlPopup.anchor,
        id: newAnchorId(),
        passageId: activeKey ?? undefined,
        createdAt: new Date().toISOString(),
      }
      if (note && note.trim()) a.note = note.trim().slice(0, 2000)
      const prev = highlights
      const next = [...highlights, a]
      setHighlights(next)
      setHlPopup(null)
      window.getSelection()?.removeAllRanges()
      void persistAnnotations({ highlights: next }, () => setHighlights(prev))
    },
    [hlPopup, highlights, persistAnnotations, activeKey],
  )

  const updateHighlightNote = useCallback(
    (id: string, note: string) => {
      const prev = highlights
      const next = highlights.map((h) => (h.id === id ? { ...h, note: note.trim() ? note.trim().slice(0, 2000) : undefined } : h))
      setHighlights(next)
      setEditPopup(null)
      void persistAnnotations({ highlights: next }, () => setHighlights(prev))
    },
    [highlights, persistAnnotations],
  )

  const deleteHighlight = useCallback(
    (id: string) => {
      const prev = highlights
      const next = highlights.filter((h) => h.id !== id)
      setHighlights(next)
      setEditPopup(null)
      void persistAnnotations({ highlights: next }, () => setHighlights(prev))
    },
    [highlights, persistAnnotations],
  )

  const clearAllHighlights = useCallback(() => {
    const prev = highlights
    const next = highlights.filter((h) => (h.passageId ?? null) !== activeKey) // chỉ xóa passage đang xem
    setHighlights(next)
    setEditPopup(null)
    void persistAnnotations({ highlights: next }, () => setHighlights(prev))
  }, [highlights, persistAnnotations, activeKey])

  const toggleQuestionBookmark = useCallback(
    (qid: string) => {
      const prev = bookmarkedQs
      const next = prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]
      setBookmarkedQs(next)
      void persistAnnotations({ bookmarked_qs: next }, () => setBookmarkedQs(prev))
    },
    [bookmarkedQs, persistAnnotations],
  )

  // Render highlight (CSS Highlight API) — chỉ passage đang xem; rebuild khi đổi group/size/contrast.
  useEffect(() => {
    if (phase !== 'active') return
    const root = passageRootRef.current
    if (!root) return
    const sync = () => {
      applyHighlights(root, visibleHighlights)
      setNoteMarkers(noteMarkerPositions(root, visibleHighlights))
    }
    sync()
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('resize', sync)
      clearHighlights()
    }
  }, [visibleHighlights, showPassage, textSize, contrast, phase, payload, activeGroup, splitPct])

  // Review: evidence highlight xanh + badge [n] — CHỈ câu thuộc group đang xem, tìm quote text-match.
  useEffect(() => {
    if (!review || phase !== 'active') return
    const root = passageRootRef.current
    if (!root) return
    const activeQids = new Set((active?.questions ?? []).map((q) => q.id))
    const evs = review.items
      .filter((it) => it.evidence && activeQids.has(it.question_id))
      // EXAM-006: truyền cả descriptor (quote + occurrence/context) để khử trùng khi highlight.
      .map((it) => ({ number: it.number, ...it.evidence! }))
    const sync = () => {
      applyEvidenceHighlights(root, evs)
      setEvMarkers(evidenceMarkerPositions(root, evs))
    }
    sync()
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('resize', sync)
      clearEvidenceHighlights()
      setEvMarkers([])
    }
  }, [review, phase, payload, activeGroup, showPassage, textSize, contrast, splitPct, active])

  // Tier0: sau khi ◀▶ đổi group/câu → cuộn tới câu (chỉ khi pending, không cuộn lúc focus thường).
  useEffect(() => {
    const id = scrollPendingRef.current
    if (!id) return
    scrollPendingRef.current = null
    document.getElementById(`q-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeGroup, activeQid])

  const limited = remaining !== null
  const lowTime = limited && (remaining as number) <= 60

  // Root class: scope + contrast + text-size (persisted). data-testid giữ nguyên cho smoke.
  const rootCls = `dc-exam ct-${contrast} ts-${textSize}`

  // ---------- Non-active states ----------
  if (phase === 'loading')
    return (
      <Shell>
        <p className="rmuted">Đang tải đề thi…</p>
      </Shell>
    )
  if (phase === 'locked')
    return (
      <Shell>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Đề thi đang khóa</h1>
        <p className="rmuted" style={{ marginTop: 8 }}>Bạn cần mở khóa đề này trước khi làm bài.</p>
        <Link href={`/tests/${testId}`} className="dcx-btn-primary" style={{ marginTop: 18 }}>
          Xem chi tiết đề
        </Link>
      </Shell>
    )
  if (phase === 'notfound')
    return (
      <Shell>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Không tìm thấy đề thi</h1>
        <Link href="/products" className="dcx-btn-primary" style={{ marginTop: 18 }}>
          Xem bộ đề
        </Link>
      </Shell>
    )
  if (phase === 'error')
    return (
      <Shell>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Có lỗi khi tải đề thi</h1>
        <button onClick={() => location.reload()} className="dcx-btn-primary" style={{ marginTop: 18 }}>
          Thử lại
        </button>
      </Shell>
    )
  if (phase === 'done')
    return (
      <Shell>
        <div className="dcx-modal-icon" style={{ margin: '0 auto 18px' }}>
          <CheckIcon className="h-7 w-7" />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Đã nộp bài</h1>
        <p className="rmuted" style={{ marginTop: 8 }}>
          Trạng thái: <b>{result?.status === 'expired' ? 'Hết giờ (tự nộp)' : 'Đã nộp'}</b>
          {result?.time_spent ? ` · Thời gian làm: ${clock(result.time_spent)}` : ''}
        </p>
        {result?.scored && result.raw_score != null && (
          <p style={{ marginTop: 8, fontSize: 18, fontWeight: 700, color: 'var(--brand)' }}>
            Điểm: {result.raw_score}
            {result.max_score != null ? `/${result.max_score}` : ''}
            {result.band != null ? ` · Band ${result.band}` : ''}
          </p>
        )}
        <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
          {(result?.attempt_id || attempt?.attempt_id) && (
            <Link href={`/result/${result?.attempt_id ?? attempt?.attempt_id}`} className="dcx-btn-primary">
              Xem kết quả chi tiết
            </Link>
          )}
          <Link href="/products" className="dcx-btn-ghost">
            Về danh sách bộ đề
          </Link>
        </div>
      </Shell>
    )

  // ---------- Instructions (capture parity: Before_reading) ----------
  if (phase === 'instructions')
    return (
      <div data-testid="exam-runner" className={rootCls}>
        <header className="dcx-header">
          <div className="dcx-header-inner">
            <div className="dcx-logo">
              <span className="dcx-logo-mark"><Mascot size={40} /></span>
              <div className="dcx-brand">
                <span className="dcx-brand-name"><b>IELTS</b>Practice</span>
                <span className="dcx-subtitle">{payload?.test.title}</span>
              </div>
            </div>
            <div className="dcx-header-spacer" />
            <button className="dcx-opts-btn" aria-label="Tùy chọn" disabled>
              <MenuIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>
        <main className="dcx-center" style={{ minHeight: 'calc(100vh - 66px)' }}>
          <div className="dcx-center-card" style={{ textAlign: 'left', maxWidth: 720 }}>
            <h1 style={{ textAlign: 'center', fontSize: 28, fontWeight: 800 }}>Hướng dẫn làm bài kiểm tra</h1>
            <h2 style={{ marginTop: 24, fontSize: 18, fontWeight: 800, textTransform: 'uppercase' }}>Lưu ý trước khi làm bài</h2>
            <p style={{ marginTop: 8, fontSize: 14, fontWeight: 700 }}>Yêu cầu về thiết bị và trình duyệt:</p>
            <ul style={{ marginTop: 8, paddingLeft: 22, lineHeight: 1.7, fontSize: 14 }} className="rmuted">
              <li>
                Vui lòng dùng <b style={{ color: 'var(--ink)' }}>Google Chrome trên máy tính/laptop</b> để có trải nghiệm ổn định nhất.
              </li>
              <li>
                Nên để cỡ chữ <b style={{ color: 'var(--ink)' }}>Vừa</b> và tương phản <b style={{ color: 'var(--ink)' }}>Chữ đen trên nền trắng</b>.
              </li>
            </ul>
            <div style={{ marginTop: 28, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setPhase('active')} className="dcx-btn-primary">
                Bắt đầu
              </button>
            </div>
          </div>
        </main>
      </div>
    )

  // ---------- Active exam ----------
  return (
    <div data-testid="exam-runner" className={rootCls}>
      <div className="dcx-shell">
        {/* Header: logo + tiêu đề + timer pill + Options */}
        <header className="dcx-header">
          <div className="dcx-header-inner">
            <div className="dcx-logo">
              <span className="dcx-logo-mark"><Mascot size={40} /></span>
              <div className="dcx-brand">
                <span className="dcx-brand-name"><b>IELTS</b>Practice</span>
                <span className="dcx-subtitle">{payload?.test.title}</span>
              </div>
            </div>
            <div className="dcx-header-spacer" />
            {review && (
              <span className="dcx-timer" title="Chế độ xem lại — đáp án đúng đã điền sẵn, evidence tô xanh trong bài đọc">
                <span className="dcx-timer-val" style={{ color: '#0E7A43' }}>✓ Xem lại bài làm</span>
              </span>
            )}
            {limited && (
              <div className={`dcx-timer${lowTime ? ' low' : ''}`}>
                <span style={{ color: 'var(--brand)', display: 'flex' }}>
                  <ClockIcon className="h-[18px] w-[18px]" />
                </span>
                <span className="dcx-timer-val">{clock(remaining as number)}</span>
                <span className="dcx-timer-lbl">còn lại</span>
              </div>
            )}
            <button onClick={() => setOptionsOpen(true)} aria-label="Tùy chọn" title="Tùy chọn" className="dcx-opts-btn">
              <MenuIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>

        {errorMsg && <p className="dcx-error">{errorMsg}</p>}

        {/* EXAM-003/009: attempt cũ không có bản chụp → nội dung là bản HIỆN TẠI, có thể đã khác lúc thi */}
        {review?.contentStale && (
          <div role="note" className="dcx-banner" style={{ background: '#fff7ed', color: '#9a3412', padding: '8px 14px', fontSize: 13 }}>
            Bài làm này không có bản lưu nội dung gốc, nên phần đề hiển thị là bản mới nhất — có thể đã khác so với lúc bạn làm bài.
          </div>
        )}

        {/* EXAM-004: bài được cập nhật ở tab/thiết bị khác → banner non-destructive, mời tải lại (không mất đáp án) */}
        {staleConflict && (
          <div role="alert" className="dcx-error" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span>Bài của bạn đã được cập nhật ở một tab hoặc thiết bị khác. Hãy tải lại để lấy bản mới nhất trước khi tiếp tục.</span>
            <button onClick={() => location.reload()} className="dcx-btn-primary">Tải lại</button>
          </div>
        )}

        {/* Listening audio */}
        {isListening && <ListeningAudioPlayer audioUrl={payload?.audio_url ?? null} />}

        {/* Banner passage/section (EN đề) */}
        {active && (
          <div className="dcx-banner">
            <div className="dcx-banner-row">
              <span className="dcx-badge">{isListening ? 'Listening' : 'Reading'}</span>
              <div>
                <div className="dcx-banner-title">
                  {sectionLabel} {activeGroup + 1}
                </div>
                <div className="dcx-banner-sub">
                  {isListening ? 'Listen and answer questions' : 'Read the text and answer questions'} {rangeLabel(active.questions)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2 cột + divider kéo */}
        <main ref={mainRef} className="dcx-split">
          {showPassage && (
            <section
              className="dcx-left"
              style={isLg ? { flex: `1 1 ${splitPct}%`, maxWidth: `${splitPct}%` } : undefined}
            >
              <div
                ref={passageRootRef}
                onMouseUp={review ? undefined : onPassageMouseUp}
                onTouchEnd={review ? undefined : onPassageMouseUp}
                className="dcx-passage themed"
              >
                {!active || active.passages.length === 0 ? (
                  <p className="rmuted">{sectionLabel} này không có đoạn văn.</p>
                ) : (
                  active.passages.map((p) => <PassageArticle key={p.id} passage={p} />)
                )}
                {/* Review: badge số câu [n] neo đầu câu evidence (không tương tác) */}
                {evMarkers.map((m, k) => (
                  <span key={`ev-${m.number}-${k}`} className="dcx-evnum" style={{ left: m.left, top: m.top }} aria-hidden>
                    [{m.number}]
                  </span>
                ))}
                {noteMarkers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-label="Xem ghi chú"
                    title="Xem ghi chú"
                    onMouseUp={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      const anchor = highlights.find((h) => h.id === m.id)
                      if (anchor) {
                        setHlPopup(null)
                        setEditPopup({ x: e.clientX, y: e.clientY, anchor })
                      }
                    }}
                    style={{ left: m.left, top: m.top }}
                    className="dcx-note-marker"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                      <path d="M4 4h16v12H10l-6 5V4z" fill="#f2724e" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
              </div>
            </section>
          )}

          {showPassage && (
            <div
              onPointerDown={onDividerDown}
              role="separator"
              aria-orientation="vertical"
              aria-label="Kéo để đổi tỉ lệ hai cột"
              className="dcx-divider"
            >
              ↔
            </div>
          )}

          <section className="dcx-right">
            <div className="dcx-qpanel themed">
              {!active || active.questions.length === 0 ? (
                <p className="rmuted">{sectionLabel} này chưa có câu hỏi.</p>
              ) : (
                blocks.map((block, bi) => (
                  <section key={bi} className="dcx-qblock">
                    <div className="dcx-qhead">
                      {block.qs.length > 1 || rangeLabel(block.qs).includes('–') ? 'Questions' : 'Question'} {rangeLabel(block.qs)}
                    </div>
                    {block.instruction && <InstructionText text={block.instruction} className="dcx-qinstr" />}
                    <div className="dcx-qlist">
                      {block.items.map((item, idx) => {
                        if (item.kind === 'matrix')
                          return (
                            <div key={`matrix-${item.qs[0].id}`}>
                              <MatchingMatrixQuestion
                                questions={item.qs}
                                options={item.options}
                                answers={answers}
                                onAnswer={onAnswerChange}
                                bookmarkedQs={bookmarkedQs}
                                onToggleBookmark={toggleQuestionBookmark}
                                activeQid={activeQid}
                                onActivate={setActiveQid}
                                readOnly={!!review}
                              />
                            </div>
                          )
                        if (item.kind === 'summary')
                          return (
                            <div key={`summary-${item.qs[0].id}`}>
                              <SummaryQuestion questions={item.qs} template={item.template} options={item.options} answers={answers} onAnswer={onAnswerChange} readOnly={!!review} />
                            </div>
                          )
                        if (item.kind === 'matchbank')
                          return (
                            <div key={`matchbank-${item.qs[0].id}`}>
                              <MatchingBankQuestion
                                questions={item.qs}
                                options={item.options}
                                answers={answers}
                                onAnswer={onAnswerChange}
                                bookmarkedQs={bookmarkedQs}
                                onToggleBookmark={toggleQuestionBookmark}
                                activeQid={activeQid}
                                onActivate={setActiveQid}
                                readOnly={!!review}
                              />
                            </div>
                          )
                        return (() => {
                            const kind = renderKindOf(item.q.type)
                            const noBadge = kind === 'gap' || kind === 'diagram' || kind === 'map'
                            const statement =
                              kind === 'mcq_single' || kind === 'mcq_multi' || kind === 'tfng' || kind === 'ynng' || kind === 'matching'
                                ? (item.q.statement ?? item.q.prompt)
                                : undefined
                            const flagged = bookmarkedQs.includes(item.q.id)
                            const isActive = activeQid === item.q.id
                            const flagBtn = (
                              <button
                                type="button"
                                onClick={() => toggleQuestionBookmark(item.q.id)}
                                aria-pressed={flagged}
                                aria-label={flagged ? 'Bỏ đánh dấu câu' : 'Đánh dấu câu'}
                                title="Đánh dấu câu để xem lại"
                                className={`dcx-flag${flagged ? ' on' : ''}`}
                              >
                                <FlagIcon filled={flagged} className="h-[18px] w-[18px]" />
                              </button>
                            )
                            if (noBadge) {
                              return (
                                <div
                                  key={item.q.id}
                                  id={`q-${item.q.id}`}
                                  style={{ position: 'relative', scrollMarginTop: 96 }}
                                  onFocus={() => setActiveQid(item.q.id)}
                                >
                                  <div style={{ position: 'absolute', right: 0, top: 0, zIndex: 1 }}>{flagBtn}</div>
                                  <div style={{ paddingRight: 28 }}>
                                    <QuestionRenderer
                                      question={item.q}
                                      value={answers[item.q.id]}
                                      onChange={(v) => onAnswerChange(item.q.id, v)}
                                      disabled={!!review}
                                    />
                                  </div>
                                </div>
                              )
                            }
                            return (
                              <div key={item.q.id} id={`q-${item.q.id}`} style={{ scrollMarginTop: 96 }} onFocus={() => setActiveQid(item.q.id)}>
                                <div className="dcx-qrow">
                                  <span className={`dcx-qnum${isActive ? ' active' : ''}${isRangeQ(item.q) ? ' range' : ''}`}>{qNumberLabel(item.q, idx + 1)}</span>
                                  {statement && <p className="dcx-qstatement">{statement}</p>}
                                  <span style={statement ? undefined : { marginLeft: 'auto' }}>{flagBtn}</span>
                                </div>
                                <div className="dcx-qbody">
                                  <QuestionRenderer
                                    question={item.q}
                                    value={answers[item.q.id]}
                                    onChange={(v) => onAnswerChange(item.q.id, v)}
                                    hideStatement={statement != null}
                                    disabled={!!review}
                                  />
                                </div>
                              </div>
                            )
                          })()
                        })}
                    </div>
                  </section>
                ))
              )}
            </div>
          </section>
        </main>

        {/* Footer: nav pills theo group + ← → + Nộp bài (capture/prototype parity) */}
        <footer className="dcx-footer">
          <div className="dcx-navgroups">
            {groups.map((g, gi) => {
              const gAnswered = g.questions.filter((q) => isAnswered(answers[q.id])).length
              if (gi === activeGroup) {
                return (
                  <div key={gi} className="dcx-navgroup">
                    <button
                      className="dcx-navlabel"
                      onClick={() => { setActiveGroup(gi); setActiveQid(null) }}
                    >
                      {sectionLabel} {gi + 1}
                    </button>
                    {g.questions.map((q, i) => {
                      const done = isAnswered(answers[q.id])
                      const flagged = bookmarkedQs.includes(q.id)
                      const isActive = activeQid === q.id
                      // Review: pill tô theo ĐÚNG/SAI của bài đã nộp (thay trạng thái đã trả lời).
                      const rv = review ? reviewByQid.get(q.id) : undefined
                      const stateCls = rv ? (rv.is_correct ? ' rv-ok' : ' rv-bad') : done && !review ? ' answered' : ''
                      return (
                        <a
                          key={q.id}
                          href={`#q-${q.id}`}
                          onClick={() => setActiveQid(q.id)}
                          aria-current={isActive ? 'true' : undefined}
                          aria-label={`Câu ${qNumberLabel(q, i + 1)}${rv ? (rv.is_correct ? ', bạn làm đúng' : ', bạn làm sai') : done ? ', đã trả lời' : ''}${flagged ? ', đã đánh dấu' : ''}`}
                          className={`dcx-navpill${stateCls}${isActive ? ' current' : ''}${flagged ? ' flagged' : ''}${isRangeQ(q) ? ' range' : ''}`}
                        >
                          {qNumberLabel(q, i + 1)}
                        </a>
                      )
                    })}
                    {gi < groups.length - 1 && <span className="dcx-navsep" />}
                  </div>
                )
              }
              return (
                <div key={gi} className="dcx-navgroup">
                  <button className="dcx-navlabel dim" onClick={() => { setActiveGroup(gi); setActiveQid(null) }} title={`Chuyển ${sectionLabel} ${gi + 1}`}>
                    {sectionLabel} {gi + 1} · {gAnswered}/{g.questions.length}
                  </button>
                  {gi < groups.length - 1 && <span className="dcx-navsep" />}
                </div>
              )
            })}
          </div>
          <div className="dcx-navright">
            <button
              onClick={() => goToFlat(Math.max(0, (curFlatIdx < 0 ? 0 : curFlatIdx) - 1))}
              disabled={curFlatIdx <= 0}
              aria-label="Câu trước"
              className="dcx-navbtn"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => goToFlat(curFlatIdx < 0 ? 0 : Math.min(flatQs.length - 1, curFlatIdx + 1))}
              disabled={flatQs.length === 0 || curFlatIdx >= flatQs.length - 1}
              aria-label="Câu sau"
              className="dcx-navbtn"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
            {review ? (
              <Link href={`/result/${review.attemptId}`} className="dcx-submit" title="Về trang kết quả">
                ← Về kết quả
              </Link>
            ) : preview ? (
              <span
                className="dcx-submit"
                aria-disabled="true"
                title="Chế độ xem trước — không nộp bài được"
                style={{ opacity: 0.55, cursor: 'not-allowed' }}
              >
                👁 Xem trước
              </span>
            ) : (
              <button onClick={() => setModalOpen(true)} className="dcx-submit" aria-label="Nộp bài" title="Nộp bài">
                Nộp bài <CheckIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </footer>
      </div>

      {/* Popup tạo highlight */}
      {hlPopup && (
        <HighlightCreatePopup
          x={hlPopup.x}
          y={hlPopup.y}
          onHighlight={() => addHighlight()}
          onSaveNote={(note) => addHighlight(note)}
          onCancel={() => setHlPopup(null)}
        />
      )}
      {/* Popup sửa/xóa highlight */}
      {editPopup && editPopup.anchor.id && (
        <HighlightEditPopup
          x={editPopup.x}
          y={editPopup.y}
          initialNote={editPopup.anchor.note ?? ''}
          onSaveNote={(note) => updateHighlightNote(editPopup.anchor.id as string, note)}
          onDelete={() => deleteHighlight(editPopup.anchor.id as string)}
          onDeleteAll={clearAllHighlights}
          onCancel={() => setEditPopup(null)}
        />
      )}

      {/* Options menu */}
      {optionsOpen && (
        <OptionsMenu
          contrast={contrast}
          textSize={textSize}
          showPassage={showPassage}
          onContrast={setContrast}
          onTextSize={setTextSize}
          onTogglePassage={() => setShowPassage((v) => !v)}
          onClose={() => setOptionsOpen(false)}
        />
      )}

      {/* Submit modal */}
      {modalOpen && (
        <div className="dcx-overlay" onClick={() => setModalOpen(false)}>
          <A11yDialog
            className="dcx-modal"
            onClose={() => setModalOpen(false)}
            labelledBy="dcx-submit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setModalOpen(false)} aria-label="Đóng" className="dcx-modal-close">
              <CloseIcon className="h-4 w-4" />
            </button>
            <div className="dcx-modal-icon">
              <NoteIcon className="h-8 w-8" />
            </div>
            <h2 id="dcx-submit-title" className="dcx-modal-title">Bạn đã sẵn sàng nộp bài?</h2>
            <p className="dcx-modal-text">
              Sau khi nộp, bạn sẽ không thể chỉnh sửa câu trả lời.<br />
              Hãy kiểm tra kỹ đáp án trước khi tiếp tục.
              {answeredCount < questions.length && (
                <>
                  <br />
                  <span className="warn">
                    Bạn đã trả lời {answeredCount}/{questions.length} câu — còn {questions.length - answeredCount} câu chưa làm.
                  </span>
                </>
              )}
            </p>
            <div className="dcx-modal-actions">
              <button onClick={() => void doSubmit()} className="dcx-btn-coral">
                Nộp bài ngay
              </button>
              <button onClick={() => setModalOpen(false)} className="dcx-btn-ghost">
                Kiểm tra lại
              </button>
            </div>
          </A11yDialog>
        </div>
      )}
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div data-testid="exam-runner" className="dc-exam ct-bw ts-regular">
      <div className="dcx-center">
        <div className="dcx-center-card">{children}</div>
      </div>
    </div>
  )
}

// Khung popup nổi dùng chung: backdrop bắt click-ra-ngoài (đóng) + clamp cả 2 trục trong viewport.
function PopupFrame({ x, y, width, onCancel, children, label }: { x: number; y: number; width: number; onCancel: () => void; children: React.ReactNode; label: string }) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 360
  const vh = typeof window !== 'undefined' ? window.innerHeight : 640
  const left = Math.min(Math.max(8, x - width / 2), vw - width - 8)
  const top = Math.min(y + 6, vh - 290)
  return (
    <>
      <div className="dcx-ctx-backdrop" onClick={onCancel} aria-hidden />
      <A11yDialog
        className="dcx-ctx"
        style={{ left, top, width }}
        onClose={onCancel}
        ariaLabel={label}
        onClick={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        {children}
      </A11yDialog>
    </>
  )
}

// Popup tạo highlight: Đánh dấu / Ghi chú (Ghi chú mở ô nhập + Lưu).
function HighlightCreatePopup({ x, y, onHighlight, onSaveNote, onCancel }: { x: number; y: number; onHighlight: () => void; onSaveNote: (note: string) => void; onCancel: () => void }) {
  const [noteMode, setNoteMode] = useState(false)
  const [note, setNote] = useState('')
  return (
    <PopupFrame x={x} y={y} width={236} onCancel={onCancel} label="Tạo tô sáng">
      <button className="dcx-ctx-item" onClick={onHighlight}>
        <span className="dcx-ctx-ico" style={{ background: '#fff3d6', color: '#c98a1a' }}>
          <PencilIcon className="h-3.5 w-3.5" />
        </span>
        Đánh dấu (Highlight)
      </button>
      <button className="dcx-ctx-item" onClick={() => setNoteMode(true)}>
        <span className="dcx-ctx-ico" style={{ background: '#ffe4d6', color: '#d1502a' }}>
          <NoteIcon className="h-3.5 w-3.5" />
        </span>
        Ghi chú (Note)
      </button>
      {noteMode && (
        <div className="dcx-ctx-noterow">
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nhập ghi chú…"
            maxLength={2000}
            className="dcx-ctx-input"
          />
          <button onClick={() => onSaveNote(note)} disabled={!note.trim()} className="dcx-ctx-save">
            Lưu
          </button>
        </div>
      )}
    </PopupFrame>
  )
}

// Popup sửa/xóa: Ghi chú (input+Lưu) / Xoá đánh dấu / Xoá tất cả (confirm).
function HighlightEditPopup({ x, y, initialNote, onSaveNote, onDelete, onDeleteAll, onCancel }: { x: number; y: number; initialNote: string; onSaveNote: (note: string) => void; onDelete: () => void; onDeleteAll: () => void; onCancel: () => void }) {
  const [note, setNote] = useState(initialNote)
  const [confirmAll, setConfirmAll] = useState(false)
  return (
    <PopupFrame x={x} y={y} width={300} onCancel={onCancel} label="Sửa tô sáng">
      <div className="dcx-ctx-item" style={{ cursor: 'default' }}>
        <span className="dcx-ctx-ico" style={{ background: '#ffe4d6', color: '#d1502a' }}>
          <NoteIcon className="h-3.5 w-3.5" />
        </span>
        Ghi chú
      </div>
      <div className="dcx-ctx-noterow">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nhập ghi chú…"
          maxLength={2000}
          className="dcx-ctx-input"
        />
        <button onClick={() => onSaveNote(note)} className="dcx-ctx-save">
          Lưu
        </button>
      </div>
      <div className="dcx-ctx-sep" />
      <button className="dcx-ctx-item danger" onClick={onDelete}>
        <span className="dcx-ctx-ico" style={{ background: '#fdeae4', color: '#d1502a' }}>
          <TrashIcon className="h-3.5 w-3.5" />
        </span>
        Xoá đánh dấu
      </button>
      {confirmAll ? (
        <div className="dcx-ctx-item" style={{ cursor: 'default', gap: 8, fontSize: 13 }}>
          Xoá tất cả?
          <button onClick={onDeleteAll} style={{ color: 'var(--coral-deep)', fontWeight: 700, textDecoration: 'underline' }}>Xoá</button>
          <button onClick={() => setConfirmAll(false)} style={{ textDecoration: 'underline' }}>Hủy</button>
        </div>
      ) : (
        <button className="dcx-ctx-item danger" onClick={() => setConfirmAll(true)}>
          <span className="dcx-ctx-ico" style={{ background: '#fdeae4', color: '#d1502a' }}>
            <TrashIcon className="h-3.5 w-3.5" />
          </span>
          Xoá tất cả
        </button>
      )}
    </PopupFrame>
  )
}

// Options menu — Contrast (3 mode) + Text size (3 mức) + toggle Đoạn văn. Overlay full-screen, drill-down.
function OptionsMenu({
  contrast,
  textSize,
  showPassage,
  onContrast,
  onTextSize,
  onTogglePassage,
  onClose,
}: {
  contrast: Contrast
  textSize: TextSize
  showPassage: boolean
  onContrast: (c: Contrast) => void
  onTextSize: (t: TextSize) => void
  onTogglePassage: () => void
  onClose: () => void
}) {
  const [sub, setSub] = useState<null | 'contrast' | 'size'>(null)
  const title = sub === 'contrast' ? 'Độ tương phản' : sub === 'size' ? 'Cỡ chữ' : 'Options'
  const contrastOpts: { key: Contrast; label: string; sw: React.CSSProperties }[] = [
    { key: 'bw', label: 'Chữ đen trên nền trắng', sw: { background: '#fff', color: '#111', border: '1px solid #ddd' } },
    { key: 'wb', label: 'Chữ trắng trên nền đen', sw: { background: '#15131f', color: '#fff' } },
    { key: 'yb', label: 'Chữ vàng trên nền đen', sw: { background: '#000', color: '#ffd60a' } },
  ]
  const sizeOpts: { key: TextSize; label: string; fs: number }[] = [
    { key: 'small', label: 'Nhỏ (Small)', fs: 14 },
    { key: 'regular', label: 'Vừa (Regular)', fs: 17 },
    { key: 'large', label: 'Lớn (Large)', fs: 20 },
  ]
  return (
    <A11yDialog className="dcx-opt-overlay" onClose={onClose} ariaLabel="Tùy chọn">
      {sub && (
        <button className="dcx-opt-back" onClick={() => setSub(null)}>‹ Options</button>
      )}
      <button className="dcx-opt-close" onClick={onClose} aria-label="Đóng">
        <CloseIcon className="h-4 w-4" />
      </button>
      <div className="dcx-opt-wrap">
        <h2 className="dcx-opt-h2">{title}</h2>

        {sub === null && (
          <>
            <button className="dcx-opt-row" onClick={() => setSub('contrast')}>
              <span className="dcx-opt-row-l">
                <span className="dcx-opt-row-ico" style={{ background: '#efe9ff', color: 'var(--brand)' }}>
                  <ContrastIcon className="h-5 w-5" />
                </span>
                <span className="dcx-opt-row-label">Độ tương phản</span>
              </span>
              <span className="dcx-opt-chevron"><ChevronRight className="h-5 w-5" /></span>
            </button>
            <button className="dcx-opt-row" onClick={() => setSub('size')}>
              <span className="dcx-opt-row-l">
                <span className="dcx-opt-row-ico" style={{ background: '#ffe4d6', color: 'var(--coral-deep)', fontSize: 15 }}>Aa</span>
                <span className="dcx-opt-row-label">Cỡ chữ</span>
              </span>
              <span className="dcx-opt-chevron"><ChevronRight className="h-5 w-5" /></span>
            </button>
            <button className="dcx-opt-row" onClick={onTogglePassage}>
              <span className="dcx-opt-row-l">
                <span className="dcx-opt-row-ico" style={{ background: '#e7f7ee', color: 'var(--green)' }}>¶</span>
                <span className="dcx-opt-row-label">Đoạn văn</span>
              </span>
              <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{showPassage ? 'Đang hiện' : 'Đang ẩn'}</span>
            </button>
          </>
        )}

        {sub === 'contrast' && (
          <div>
            {contrastOpts.map((o) => (
              <button key={o.key} className="dcx-opt-choice" onClick={() => onContrast(o.key)}>
                <span className="dcx-opt-check" style={{ opacity: contrast === o.key ? 1 : 0 }}>
                  <CheckIcon className="h-4 w-4" />
                </span>
                <span className="dcx-opt-swatch" style={o.sw}>A</span>
                <span className="dcx-opt-choice-label">{o.label}</span>
              </button>
            ))}
          </div>
        )}

        {sub === 'size' && (
          <div>
            {sizeOpts.map((o) => (
              <button key={o.key} className="dcx-opt-choice" onClick={() => onTextSize(o.key)}>
                <span className="dcx-opt-check" style={{ opacity: textSize === o.key ? 1 : 0 }}>
                  <CheckIcon className="h-4 w-4" />
                </span>
                <span className="dcx-opt-choice-label" style={{ fontSize: o.fs }}>{o.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </A11yDialog>
  )
}
