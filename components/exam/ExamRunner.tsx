'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AttemptDTO, ExamPayload, SubmitResult } from '@/types/exam'
import { QuestionRenderer } from '@/components/exam/questions/QuestionRenderer'
import { MatchingMatrixQuestion } from '@/components/exam/questions/MatchingMatrixQuestion'
import { ListeningAudioPlayer } from '@/components/exam/ListeningAudioPlayer'
import { BookmarkFlag } from '@/components/exam/BookmarkFlag'
import { isAnswered, renderKindOf, type AnswerValue, type ExamQuestion, type QOption } from '@/components/exam/questions/types'
import {
  anchorFromRange,
  applyHighlights,
  clearHighlights,
  highlightAtPoint,
  newAnchorId,
  noteMarkerPositions,
  rangeWithinRoot,
  type HighlightAnchor,
} from '@/lib/exam/highlight-anchor'

// Shape payload (BE trả `unknown` → cast + guard). KHÔNG có đáp án đúng (guard server).
type Passage = { id: string; number?: number; title?: string; content?: string }

// W9 parity (capture): +'instructions' — màn "Hướng dẫn làm bài kiểm tra" trước khi vào active.
type Phase = 'loading' | 'locked' | 'notfound' | 'error' | 'instructions' | 'active' | 'submitting' | 'done'
type Contrast = 'bw' | 'wb' | 'yb' // W9: Black-on-white / White-on-black / Yellow-on-black
type TextSize = 'base' | 'lg' | 'xl' // W9: Regular / Large / Extra large

// W9 — nhóm câu theo passage (Reading) / section (Listening) để switch như reference.
type ExamGroup = { key: string | null; passages: Passage[]; questions: ExamQuestion[] }

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

function rangeLabel(qs: ExamQuestion[]): string {
  const nums = qs.map((q) => q.number).filter((n): n is number => typeof n === 'number')
  if (nums.length === 0) return ''
  const a = Math.min(...nums)
  const b = Math.max(...nums)
  return a === b ? `${a}` : `${a}–${b}`
}

// W9 (T3.1) — gom câu matching_information liên tiếp (cùng pool options) → 1 matrix; còn lại render đơn.
type RenderItem = { kind: 'single'; q: ExamQuestion } | { kind: 'matrix'; qs: ExamQuestion[]; options: QOption[] }
const isMatchingInfo = (q: ExamQuestion): boolean => (q.type ?? '').toLowerCase().trim() === 'matching_information'
const optionsSig = (opts?: QOption[]): string => (Array.isArray(opts) ? opts.map((o) => o.key).join('|') : '')
function buildRenderItems(qs: ExamQuestion[]): RenderItem[] {
  const items: RenderItem[] = []
  let i = 0
  while (i < qs.length) {
    const q = qs[i]
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

export function ExamRunner({ testId }: { testId: string }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [attempt, setAttempt] = useState<AttemptDTO | null>(null)
  const [payload, setPayload] = useState<ExamPayload | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [remaining, setRemaining] = useState<number | null>(null)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [showPassage, setShowPassage] = useState(true)
  const [contrast, setContrast] = useState<Contrast>('bw')
  const [textSize, setTextSize] = useState<TextSize>('base')
  const [optionsOpen, setOptionsOpen] = useState(false)
  // W9 annotation
  const [highlights, setHighlights] = useState<HighlightAnchor[]>([])
  const [bookmarkedQs, setBookmarkedQs] = useState<string[]>([])
  const [hlPopup, setHlPopup] = useState<{ x: number; y: number; anchor: HighlightAnchor } | null>(null)
  const [editPopup, setEditPopup] = useState<{ x: number; y: number; anchor: HighlightAnchor } | null>(null)
  const [noteMarkers, setNoteMarkers] = useState<{ id: string; left: number; top: number }[]>([])
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
  const scrollPendingRef = useRef<string | null>(null) // Tier0: cuộn tới câu sau khi ◀▶ đổi group
  const mainRef = useRef<HTMLElement | null>(null) // Tier0: đo bề rộng để kéo divider

  const passages = (Array.isArray(payload?.passages) ? payload?.passages : []) as Passage[]
  const questions = (Array.isArray(payload?.questions) ? payload?.questions : []) as ExamQuestion[]
  const answeredCount = questions.filter((q) => isAnswered(answers[q.id])).length

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
        body: JSON.stringify({ attempt_id: attempt.attempt_id, answers }),
      })
      const b = await r.json().catch(() => null)
      if (r.ok && b?.success) {
        setResult(b.data as SubmitResult)
        setPhase('done')
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
  }, [testId, router])

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

  // --- W9: warn khi rời trang lúc đang làm + có đáp án chưa nộp ---
  useEffect(() => {
    if (phase !== 'active') return
    const handler = (e: BeforeUnloadEvent) => {
      if (answeredCount > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [phase, answeredCount])

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
        void fetch(`/api/attempts/${attempt.attempt_id}/answers`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ answers: next }),
        }).catch(() => {})
      }, 800)
    },
    [attempt],
  )

  const onAnswerChange = useCallback(
    (qid: string, v: AnswerValue) => {
      setAnswers((a) => {
        const next = { ...a, [qid]: v }
        scheduleAnswerSave(next)
        return next
      })
    },
    [scheduleAnswerSave],
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
  // T2.3: đồng thời tính vị trí icon note (bong bóng) cho highlight CÓ note + recompute khi resize/kéo divider.
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

  // Tier0: sau khi ◀▶ đổi group/câu → cuộn tới câu (chỉ khi pending, không cuộn lúc focus thường).
  useEffect(() => {
    const id = scrollPendingRef.current
    if (!id) return
    scrollPendingRef.current = null
    document.getElementById(`q-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeGroup, activeQid])

  const sizeCls = textSize === 'lg' ? 'text-lg' : textSize === 'xl' ? 'text-xl' : 'text-base'
  // Theme theo contrast.
  const T =
    contrast === 'wb'
      ? {
          root: 'bg-black text-white',
          head: 'border-slate-700 bg-black',
          card: 'border-slate-700 bg-black',
          band: 'border-slate-700 bg-slate-900',
          subtle: 'text-slate-300',
          navIdle: 'bg-slate-800 text-slate-100 border-slate-600',
          footer: 'border-slate-700 bg-slate-900',
          footAccent: 'bg-slate-800',
          seg: 'bg-slate-600',
        }
      : contrast === 'yb'
        ? {
            root: 'bg-black text-[#F2A93B]',
            head: 'border-[#F2A93B]/30 bg-black',
            card: 'border-[#F2A93B]/30 bg-black',
            band: 'border-[#F2A93B]/40 bg-[#2a2200]',
            subtle: 'text-[#F2A93B]/70',
            navIdle: 'bg-[#3a2e00] text-[#F2A93B] border-[#F2A93B]/50',
            footer: 'border-[#F2A93B]/30 bg-[#191400]',
            footAccent: 'bg-[#2a2200]',
            seg: 'bg-[#F2A93B]/30',
          }
        : {
            root: 'bg-white text-slate-900',
            head: 'border-slate-200 bg-white',
            card: 'border-slate-200 bg-white',
            band: 'border-[#e7e5dc] bg-[#EEEDE7]',
            subtle: 'text-slate-500',
            navIdle: 'bg-white text-slate-700 border-slate-300',
            footer: 'border-slate-200 bg-[#F5F5F4]',
            footAccent: 'bg-[#ECECEA]',
            seg: 'bg-slate-300',
          }
  const darkInputs = contrast !== 'bw'

  const limited = remaining !== null
  const lowTime = limited && (remaining as number) <= 60
  // Capture parity: "59 minutes remaining" (EN, theo reference).
  const timerLabel = !limited
    ? 'No time limit'
    : (remaining as number) >= 60
      ? `${Math.ceil((remaining as number) / 60)} minutes remaining`
      : `${Math.ceil(remaining as number)} seconds remaining`

  // ---------- Non-active states ----------
  if (phase === 'loading')
    return (
      <Shell>
        <p className="text-slate-500">Đang tải đề thi…</p>
      </Shell>
    )
  if (phase === 'locked')
    return (
      <Shell>
        <h1 className="text-xl font-bold">Đề thi đang khóa</h1>
        <p className="mt-2 text-slate-500">Bạn cần mở khóa đề này trước khi làm bài.</p>
        <Link href={`/tests/${testId}`} className="mt-4 inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white">
          Xem chi tiết đề
        </Link>
      </Shell>
    )
  if (phase === 'notfound')
    return (
      <Shell>
        <h1 className="text-xl font-bold">Không tìm thấy đề thi</h1>
        <Link href="/products" className="mt-4 inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white">
          Xem bộ đề
        </Link>
      </Shell>
    )
  if (phase === 'error')
    return (
      <Shell>
        <h1 className="text-xl font-bold">Có lỗi khi tải đề thi</h1>
        <button onClick={() => location.reload()} className="mt-4 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white">
          Thử lại
        </button>
      </Shell>
    )
  if (phase === 'done')
    return (
      <Shell>
        <h1 className="text-xl font-bold">Đã nộp bài ✓</h1>
        <p className="mt-2 text-slate-600">
          Trạng thái: <b>{result?.status === 'expired' ? 'Hết giờ (tự nộp)' : 'Đã nộp'}</b>
          {result?.time_spent ? ` · Thời gian làm: ${clock(result.time_spent)}` : ''}
        </p>
        {result?.scored && result.raw_score != null && (
          <p className="mt-2 text-lg font-semibold text-teal-700">
            Điểm: {result.raw_score}
            {result.max_score != null ? `/${result.max_score}` : ''}
            {result.band != null ? ` · Band ${result.band}` : ''}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {(result?.attempt_id || attempt?.attempt_id) && (
            <Link
              href={`/result/${result?.attempt_id ?? attempt?.attempt_id}`}
              className="inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white"
            >
              Xem kết quả chi tiết
            </Link>
          )}
          <Link href="/products" className="inline-block rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
            Về danh sách bộ đề
          </Link>
        </div>
      </Shell>
    )

  // ---------- Instructions (capture parity: Before_reading) ----------
  if (phase === 'instructions')
    return (
      <div data-testid="exam-runner" className="flex min-h-screen flex-col bg-white text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-700 text-[10px] font-bold leading-none text-white">
              IP
            </div>
            {/* Capture parity (Before_reading): chỉ title — timer hiện sau khi Bắt đầu. */}
            <div className="min-w-0">
              <div className="truncate font-semibold leading-tight">{payload?.test.title}</div>
            </div>
            <span className="ml-auto px-1 text-2xl leading-none" aria-hidden>
              ☰
            </span>
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-8 shadow-[0_8px_40px_rgba(0,0,0,0.10)]">
            <h1 className="text-center text-3xl font-extrabold">Hướng dẫn làm bài kiểm tra</h1>
            <h2 className="mt-7 text-xl font-extrabold uppercase">Lưu ý trước khi làm bài kiểm tra</h2>
            <p className="mt-2 text-sm font-bold">Yêu cầu về thiết bị và trình duyệt:</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-6 text-sm leading-relaxed">
              <li>
                Vui lòng sử dụng <b>Google Chrome trên máy tính để bàn hoặc laptop</b> để có trải nghiệm ổn định nhất.
              </li>
              <li>
                Không nên điều chỉnh size chữ (luôn để <b>REGULAR</b>) và Contrast (luôn để <b>Black on White</b>) để có trải nghiệm tốt
                nhất.
              </li>
            </ul>
            <hr className="mt-12 border-t border-[#F2A93B]" />
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setPhase('active')}
                className="rounded-lg border border-[#8B1E1E]/50 px-7 py-2.5 font-semibold text-[#8B1E1E] hover:bg-red-50"
              >
                Bắt đầu
              </button>
            </div>
          </div>
        </main>
      </div>
    )

  // ---------- Active exam ----------
  // Capture parity: desktop = KHÓA chiều cao trang (h-screen overflow-hidden) — chỉ 2 cột cuộn bên trong,
  //   không cuộn ra khoảng trắng; lề ngoài ~1cm (px-6), nội dung phủ gần hết bề rộng như reference 1920px.
  return (
    <div data-testid="exam-runner" className={`flex min-h-screen flex-col lg:h-screen lg:overflow-hidden ${T.root} ${sizeCls}`}>
      {/* Toolbar gọn như reference — logo + title + timer (subtitle) + ☰ trần (không viền). */}
      <header className={`sticky top-0 z-20 shrink-0 border-b ${T.head}`}>
        <div className="flex w-full items-center gap-3 px-6 py-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-700 text-[10px] font-bold leading-none text-white">
            IP
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold leading-tight">{payload?.test.title}</div>
            <div className={`text-xs ${lowTime ? 'font-medium text-red-600' : T.subtle}`}>{timerLabel}</div>
          </div>
          <button onClick={() => setOptionsOpen(true)} aria-label="Tùy chọn" title="Tùy chọn" className="ml-auto px-1 text-2xl leading-none">
            ☰
          </button>
        </div>
      </header>

      {errorMsg && <p className="w-full px-6 pt-2 text-sm text-red-600">{errorMsg}</p>}

      {/* Listening audio */}
      {isListening && (
        <div className="w-full shrink-0 px-6 pt-3">
          <ListeningAudioPlayer audioUrl={payload?.audio_url ?? null} />
        </div>
      )}

      {/* Band header passage/section — EN theo capture ("Read the text and answer questions 1–13"). */}
      {active && (
        <div className="w-full shrink-0 px-6 pt-3">
          <div className={`rounded-lg border px-4 py-2.5 ${T.band}`}>
            <div className="font-bold uppercase">
              {sectionLabel} {activeGroup + 1}
            </div>
            <div className={`text-sm ${T.subtle}`}>
              {isListening ? 'Listen and answer questions' : 'Read the text and answer questions'} {rangeLabel(active.questions)}
            </div>
          </div>
        </div>
      )}

      {/* 2 cột borderless + divider CAM kéo được (capture parity); desktop: cuộn TRONG cột, trang không cuộn */}
      <main ref={mainRef} className="flex w-full flex-1 flex-col px-6 pb-6 pt-4 lg:min-h-0 lg:flex-row lg:gap-0 lg:overflow-hidden lg:pb-2">
        {showPassage && (
          <section
            style={isLg ? { flexBasis: `${splitPct}%`, maxWidth: `${splitPct}%` } : undefined}
            className="exam-col-scroll mb-6 min-w-0 lg:mb-0 lg:h-full lg:overflow-auto lg:pr-5"
          >
            <div ref={passageRootRef} onMouseUp={onPassageMouseUp} onTouchEnd={onPassageMouseUp} className="exam-passage relative">
              {!active || active.passages.length === 0 ? (
                <p className={T.subtle}>{sectionLabel} này không có đoạn văn.</p>
              ) : (
                active.passages.map((p) => (
                  <article key={p.id} className="mb-6 last:mb-0">
                    {p.title && <h2 className="mb-2 font-semibold">{p.title}</h2>}
                    <p className="whitespace-pre-line text-justify leading-relaxed">{p.content}</p>
                  </article>
                ))
              )}
              {/* T2.3: icon note (bong bóng) cạnh đoạn có note → bấm mở popup sửa/xóa */}
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
                  className="absolute -mt-1 -translate-y-0.5 leading-none"
                >
                  {/* Capture parity (note.png): bong bóng note TRẮNG viền tối trên nền highlight maroon */}
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
                    <path d="M4 4h16v12H10l-6 5V4z" fill="#fff" stroke="#475569" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Divider dọc CAM + handle ↔ (kéo đổi tỉ lệ) — chỉ desktop */}
        {showPassage && (
          <div
            onPointerDown={onDividerDown}
            role="separator"
            aria-orientation="vertical"
            aria-label="Kéo để đổi tỉ lệ hai cột"
            className="relative hidden w-3 shrink-0 cursor-col-resize touch-none select-none lg:flex lg:items-center lg:justify-center"
          >
            <div className="h-full w-[3px] rounded bg-[#F2A93B]" />
            <span
              className={`absolute flex h-7 w-6 items-center justify-center rounded border text-xs shadow-sm ${
                darkInputs ? 'border-slate-600 bg-slate-800 text-slate-200' : 'border-slate-300 bg-white text-slate-600'
              }`}
            >
              ↔
            </span>
          </div>
        )}

        <section className="exam-col-scroll min-w-0 lg:h-full lg:flex-1 lg:overflow-auto lg:pl-5">
          {!active || active.questions.length === 0 ? (
            <p className={T.subtle}>{sectionLabel} này chưa có câu hỏi.</p>
          ) : (
            <div className="space-y-7">
              {blocks.map((block, bi) => (
                <section key={bi}>
                  {/* Header block "Questions a–b" + instruction 1 lần (capture parity) */}
                  <h3 className="text-lg font-extrabold">
                    {block.qs.length > 1 ? 'Questions' : 'Question'} {rangeLabel(block.qs)}
                  </h3>
                  {block.instruction && (
                    <InstructionText text={block.instruction} className={`mt-1 whitespace-pre-line text-sm ${T.subtle}`} />
                  )}
                  <ol className="mt-3 space-y-5">
                    {block.items.map((item, idx) =>
                      item.kind === 'matrix' ? (
                        <li key={`matrix-${item.qs[0].id}`}>
                          <MatchingMatrixQuestion
                            questions={item.qs}
                            options={item.options}
                            answers={answers}
                            onAnswer={onAnswerChange}
                            contrast={darkInputs}
                            bookmarkedQs={bookmarkedQs}
                            onToggleBookmark={toggleQuestionBookmark}
                            activeQid={activeQid}
                            onActivate={setActiveQid}
                          />
                        </li>
                      ) : (
                        (() => {
                          // Capture parity: số câu INLINE với statement (mcq/tfng/matching);
                          //   gap/diagram/map = số nằm trong ô input (placeholder) → KHÔNG badge ngoài.
                          const kind = renderKindOf(item.q.type)
                          const noBadge = kind === 'gap' || kind === 'diagram' || kind === 'map'
                          const statement =
                            kind === 'mcq_single' || kind === 'mcq_multi' || kind === 'tfng' || kind === 'ynng' || kind === 'matching'
                              ? (item.q.statement ?? item.q.prompt)
                              : undefined
                          const flagged = bookmarkedQs.includes(item.q.id)
                          const isActive = activeQid === item.q.id
                          const flagBtn = (cls: string) => (
                            <button
                              type="button"
                              onClick={() => toggleQuestionBookmark(item.q.id)}
                              aria-pressed={flagged}
                              aria-label={flagged ? 'Bỏ đánh dấu câu' : 'Đánh dấu câu'}
                              title="Đánh dấu câu để xem lại"
                              className={`${cls} ${flagged ? '' : 'text-slate-400 hover:text-slate-500'}`}
                            >
                              <BookmarkFlag filled={flagged} className="h-4 w-4" />
                            </button>
                          )
                          if (noBadge) {
                            return (
                              <li key={item.q.id} id={`q-${item.q.id}`} className="relative scroll-mt-24" onFocus={() => setActiveQid(item.q.id)}>
                                {flagBtn('absolute right-0 top-0 z-10')}
                                <div className="pr-7">
                                  <QuestionRenderer
                                    question={item.q}
                                    value={answers[item.q.id]}
                                    onChange={(v) => onAnswerChange(item.q.id, v)}
                                    contrast={darkInputs}
                                  />
                                </div>
                              </li>
                            )
                          }
                          return (
                            <li key={item.q.id} id={`q-${item.q.id}`} className="scroll-mt-24" onFocus={() => setActiveQid(item.q.id)}>
                              <div className="flex items-start gap-2.5">
                                <span
                                  className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded px-1 text-base font-bold ${
                                    isActive ? 'border-2 border-amber-500' : ''
                                  }`}
                                >
                                  {item.q.number ?? idx + 1}
                                </span>
                                {statement && <p className="min-w-0 flex-1 pt-0.5 font-semibold leading-snug">{statement}</p>}
                                {flagBtn(`${statement ? '' : 'ml-auto'} mt-1 shrink-0`)}
                              </div>
                              <div className="mt-2 pl-9">
                                <QuestionRenderer
                                  question={item.q}
                                  value={answers[item.q.id]}
                                  onChange={(v) => onAnswerChange(item.q.id, v)}
                                  contrast={darkInputs}
                                  hideStatement={statement != null}
                                />
                              </div>
                            </li>
                          )
                        })()
                      ),
                    )}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer nav (capture parity): segment xanh lá phía trên số (answered) + cờ bookmark + ô active viền cam;
          group khác = label + "x of N"; nút ✓ nộp bài nằm TRONG footer bên phải. */}
      <footer className={`sticky bottom-0 z-20 shrink-0 border-t ${T.footer}`}>
        <div className="flex w-full items-stretch px-6">
          <div className="flex flex-1 items-end gap-2 overflow-x-auto py-1.5">
            {groups.map((g, gi) => {
              const gAnswered = g.questions.filter((q) => isAnswered(answers[q.id])).length
              if (gi === activeGroup) {
                return (
                  <div key={gi} className="flex items-end gap-1.5">
                    <span className="shrink-0 pb-1.5 text-xs font-bold uppercase">
                      {sectionLabel} {gi + 1}
                    </span>
                    {g.questions.map((q, i) => {
                      const done = isAnswered(answers[q.id])
                      const flagged = bookmarkedQs.includes(q.id)
                      const isActive = activeQid === q.id
                      return (
                        <div key={q.id} className="flex shrink-0 flex-col items-center gap-1">
                          <span className={`relative h-1 w-6 rounded-sm ${done ? 'bg-green-600' : T.seg}`}>
                            {flagged && <BookmarkFlag filled className="absolute -top-2.5 right-0 h-3 w-3" />}
                          </span>
                          <a
                            href={`#q-${q.id}`}
                            onClick={() => setActiveQid(q.id)}
                            aria-current={isActive ? 'true' : undefined}
                            aria-label={`Câu ${q.number ?? i + 1}${done ? ', đã trả lời' : ''}${flagged ? ', đã đánh dấu' : ''}`}
                            className={`flex h-7 min-w-7 items-center justify-center rounded px-1 text-xs ${T.navIdle} ${
                              isActive ? 'border-2 border-amber-500 font-bold' : 'border'
                            }`}
                          >
                            {q.number ?? i + 1}
                          </a>
                        </div>
                      )
                    })}
                  </div>
                )
              }
              return (
                <div key={gi} className="flex shrink-0 flex-col gap-1">
                  <span className={`h-1 w-full rounded-sm ${gAnswered === g.questions.length && g.questions.length > 0 ? 'bg-green-600' : T.seg}`} />
                  <button onClick={() => { setActiveGroup(gi); setActiveQid(null) }} className="px-1 text-xs" title={`Chuyển ${sectionLabel} ${gi + 1}`}>
                    <span className="font-bold uppercase">
                      {sectionLabel} {gi + 1}
                    </span>{' '}
                    <span className={T.subtle}>
                      {gAnswered} of {g.questions.length}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
          <button
            onClick={() => setModalOpen(true)}
            aria-label="Nộp bài"
            title="Nộp bài"
            className={`-mr-6 flex items-center self-stretch px-5 ${T.footAccent}`}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 12l5 5L20 7" />
            </svg>
          </button>
        </div>
      </footer>

      {/* ◀▶ chuyển câu (vượt passage) — floating ngay trên footer, góc phải (capture parity) */}
      <div className="fixed bottom-14 right-3 z-30 flex gap-1.5">
        <button
          onClick={() => goToFlat(Math.max(0, (curFlatIdx < 0 ? 0 : curFlatIdx) - 1))}
          disabled={curFlatIdx <= 0}
          aria-label="Câu trước"
          className="flex h-10 w-10 items-center justify-center rounded bg-slate-900 text-lg text-white shadow disabled:opacity-40"
        >
          ←
        </button>
        <button
          onClick={() => goToFlat(curFlatIdx < 0 ? 0 : Math.min(flatQs.length - 1, curFlatIdx + 1))}
          disabled={flatQs.length === 0 || curFlatIdx >= flatQs.length - 1}
          aria-label="Câu sau"
          className="flex h-10 w-10 items-center justify-center rounded bg-slate-900 text-lg text-white shadow disabled:opacity-40"
        >
          →
        </button>
      </div>

      {/* Popup tạo highlight (menu Highlight / Note) */}
      {hlPopup && (
        <HighlightCreatePopup
          x={hlPopup.x}
          y={hlPopup.y}
          onHighlight={() => addHighlight()}
          onSaveNote={(note) => addHighlight(note)}
          onCancel={() => setHlPopup(null)}
        />
      )}
      {/* Popup sửa/xóa highlight (F-c) — menu Highlight/Note/Delete/Delete All (capture parity) */}
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

      {/* Submit modal — capture parity: 1 bước "Are you ready to submit your test?" + ✕ cam + nút amber */}
      {modalOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className={`relative w-full max-w-xl rounded-xl border p-8 shadow-2xl ${T.card}`}>
            <button
              onClick={() => setModalOpen(false)}
              aria-label="Đóng"
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[#F2A93B] text-sm font-bold text-white"
            >
              ✕
            </button>
            <h3 className="text-center text-3xl font-extrabold leading-snug">Are you ready to submit your test?</h3>
            <div className={`mt-5 space-y-1 text-center text-sm ${T.subtle}`}>
              <p>- Once you submit, you will not be able to make any further changes.</p>
              <p>- Please review your answers carefully before proceeding.</p>
              <p>- If you are ready, click Submit to complete your test.</p>
              {answeredCount < questions.length && (
                <p className="text-xs text-amber-600">
                  You have answered {answeredCount}/{questions.length} questions — {questions.length - answeredCount} unanswered.
                </p>
              )}
            </div>
            <div className="mt-7 flex justify-center gap-3">
              <button
                onClick={() => void doSubmit()}
                className="rounded-lg bg-[#E8A33D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#d6932f]"
              >
                Submit Now
              </button>
              <button
                onClick={() => setModalOpen(false)}
                className={`rounded-lg border px-5 py-2.5 text-sm font-semibold ${
                  darkInputs ? 'border-slate-500' : 'border-[#E8A33D] bg-[#FFF8E7] text-slate-800'
                }`}
              >
                Check again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div data-testid="exam-runner" className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center">{children}</div>
    </div>
  )
}

// Hàng menu trong popup highlight (icon + label).
function PopupRow({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100 ${danger ? 'text-red-600' : 'text-slate-800'}`}
    >
      <span className="w-4 text-center">{icon}</span> {label}
    </button>
  )
}

// Khung popup nổi dùng chung: backdrop bắt click-ra-ngoài (đóng) + clamp cả 2 trục trong viewport.
function PopupFrame({ x, y, width, onCancel, children, label }: { x: number; y: number; width: number; onCancel: () => void; children: React.ReactNode; label: string }) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 360
  const vh = typeof window !== 'undefined' ? window.innerHeight : 640
  const left = Math.min(Math.max(8, x - width / 2), vw - width - 8)
  const top = Math.min(y + 6, vh - 290)
  // Đóng bằng onClick (SAU mouseup): nếu đóng ở mousedown, backdrop unmount giữa gesture →
  //   mouseup rơi xuống passage và tạo lại popup (verified bug).
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onCancel} aria-hidden />
      <div
        className="fixed z-50 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-900 shadow-xl"
        style={{ left, top, width }}
        role="dialog"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  )
}

// W9 parity (T2.2/capture) — popup tạo highlight: menu Highlight / Note (Note mở ô nhập + Save cam).
function HighlightCreatePopup({ x, y, onHighlight, onSaveNote, onCancel }: { x: number; y: number; onHighlight: () => void; onSaveNote: (note: string) => void; onCancel: () => void }) {
  const [noteMode, setNoteMode] = useState(false)
  const [note, setNote] = useState('')
  return (
    <PopupFrame x={x} y={y} width={232} onCancel={onCancel} label="Tạo tô sáng">
      <PopupRow icon="✏️" label="Highlight" onClick={onHighlight} />
      <PopupRow icon="✎" label="Note" onClick={() => setNoteMode(true)} />
      {noteMode && (
        <div className="mt-1 flex items-center gap-1.5 border-t border-slate-100 px-1 pt-1.5 pb-0.5">
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Text note"
            maxLength={2000}
            className="w-full min-w-0 rounded border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-[#E8A33D]"
          />
          <button
            onClick={() => onSaveNote(note)}
            disabled={!note.trim()}
            className="rounded-md bg-[#E8A33D] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      )}
    </PopupFrame>
  )
}

// W9 parity (T2.2/F-c/capture) — popup sửa/xóa khi click đoạn đã tô: Highlight / Note(input+Save) / Delete / Delete All (confirm).
function HighlightEditPopup({ x, y, initialNote, onSaveNote, onDelete, onDeleteAll, onCancel }: { x: number; y: number; initialNote: string; onSaveNote: (note: string) => void; onDelete: () => void; onDeleteAll: () => void; onCancel: () => void }) {
  const [note, setNote] = useState(initialNote)
  const [confirmAll, setConfirmAll] = useState(false)
  return (
    <PopupFrame x={x} y={y} width={300} onCancel={onCancel} label="Sửa tô sáng">
      <PopupRow icon="✏️" label="Highlight" onClick={onCancel} />
      <div className="flex items-center gap-2 px-2 pt-1 text-sm text-slate-800">
        <span className="w-4 text-center">✎</span> Note
      </div>
      <div className="flex items-center gap-1.5 px-1 py-1.5">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Text note"
          maxLength={2000}
          className="w-full min-w-0 rounded border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-[#E8A33D]"
        />
        <button onClick={() => onSaveNote(note)} className="rounded-md bg-[#E8A33D] px-3 py-1.5 text-sm font-semibold text-white">
          Save
        </button>
      </div>
      <div className="border-t border-slate-100 pt-1">
        <PopupRow icon="⌫" label="Delete" onClick={onDelete} danger />
        {confirmAll ? (
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-700">
            Xóa tất cả?
            <button onClick={onDeleteAll} className="font-medium text-red-600 underline">Xóa</button>
            <button onClick={() => setConfirmAll(false)} className="underline">Hủy</button>
          </div>
        ) : (
          <PopupRow icon="🗑" label="Delete All" onClick={() => setConfirmAll(true)} danger />
        )}
      </div>
    </PopupFrame>
  )
}

// W9 — menu Options (Contrast 3-mode + Text size 3-mức), overlay full-screen (capture: title lớn, icon row).
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
  const contrastOpts: { key: Contrast; label: string }[] = [
    { key: 'bw', label: 'Black on white' },
    { key: 'wb', label: 'White on black' },
    { key: 'yb', label: 'Yellow on black' },
  ]
  const sizeOpts: { key: TextSize; label: string }[] = [
    { key: 'base', label: 'Regular' },
    { key: 'lg', label: 'Large' },
    { key: 'xl', label: 'Extra large' },
  ]
  const [sub, setSub] = useState<null | 'contrast' | 'size'>(null)
  // T1.5: theme overlay theo contrast hiện tại (trước đây hardcode trắng → chói ở dark mode).
  const dark = contrast !== 'bw'
  const rootTheme = contrast === 'yb' ? 'bg-black text-[#F2A93B]' : contrast === 'wb' ? 'bg-black text-white' : 'bg-white text-slate-900'
  // Hàng đã chọn = pill sáng #F6F6F6 + chữ tối (đọc rõ ở mọi mode); hàng khác hover theo nền.
  const rowCls = (selected: boolean) =>
    `flex w-full items-center gap-3 rounded-md px-4 py-3 text-left text-base ${selected ? 'bg-[#F6F6F6] font-bold text-slate-900' : dark ? 'hover:bg-white/10' : 'hover:bg-slate-50'}`
  const navRowCls = `flex w-full items-center gap-3 rounded-md px-4 py-3 text-left text-base font-semibold ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-50'}`
  // T2.1: drill-down (root → submenu) như reference.
  const title = sub === 'contrast' ? 'Contrast' : sub === 'size' ? 'Text size' : 'Options'
  return (
    <div className={`fixed inset-0 z-40 overflow-auto ${rootTheme}`} role="dialog" aria-modal="true" aria-label="Tùy chọn">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="relative flex items-center justify-center">
          {sub && (
            <button onClick={() => setSub(null)} className="absolute left-0 flex items-center gap-1 text-base font-bold">‹ Options</button>
          )}
          <h2 className="text-4xl font-extrabold">{title}</h2>
          <button onClick={onClose} aria-label="Đóng" className={`absolute right-0 flex h-10 w-10 items-center justify-center rounded-full border text-lg ${dark ? 'border-current' : 'border-slate-300'}`}>✕</button>
        </div>

        {sub === null && (
          <div className="mt-10 space-y-1">
            <button onClick={() => setSub('contrast')} className={navRowCls}>
              <span aria-hidden>◐</span>
              <span className="flex-1">Contrast</span> <span className="opacity-60">›</span>
            </button>
            <button onClick={() => setSub('size')} className={navRowCls}>
              <span aria-hidden className="text-sm font-extrabold">Aa</span>
              <span className="flex-1">Text size</span> <span className="opacity-60">›</span>
            </button>
            <button onClick={onTogglePassage} className={navRowCls}>
              <span aria-hidden>¶</span>
              <span className="flex-1">Đoạn văn</span> <span className="opacity-60">{showPassage ? 'Đang hiện' : 'Đang ẩn'}</span>
            </button>
          </div>
        )}
        {sub === 'contrast' && (
          <div className="mt-10 space-y-1">
            {contrastOpts.map((o) => (
              <button key={o.key} onClick={() => onContrast(o.key)} className={rowCls(contrast === o.key)}>
                <span className="w-5 text-lg">{contrast === o.key ? '✓' : ''}</span> <span className="font-semibold">{o.label}</span>
              </button>
            ))}
          </div>
        )}
        {sub === 'size' && (
          <div className="mt-10 space-y-1">
            {sizeOpts.map((o) => (
              <button key={o.key} onClick={() => onTextSize(o.key)} className={rowCls(textSize === o.key)}>
                <span className="w-5 text-lg">{textSize === o.key ? '✓' : ''}</span> <span className="font-semibold">{o.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
