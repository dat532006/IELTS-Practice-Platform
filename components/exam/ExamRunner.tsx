'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AttemptDTO, ExamPayload, SubmitResult } from '@/types/exam'
import { SKILL_LABEL } from '@/lib/products/access-state'
import { QuestionRenderer } from '@/components/exam/questions/QuestionRenderer'
import { ListeningAudioPlayer } from '@/components/exam/ListeningAudioPlayer'
import { isAnswered, type AnswerValue, type ExamQuestion } from '@/components/exam/questions/types'
import {
  anchorFromRange,
  applyHighlights,
  clearHighlights,
  newAnchorId,
  rangeWithinRoot,
  type HighlightAnchor,
} from '@/lib/exam/highlight-anchor'

// Shape payload (BE trả `unknown` → cast + guard). KHÔNG có đáp án đúng (guard server).
type Passage = { id: string; number?: number; title?: string; content?: string }

type Phase = 'loading' | 'locked' | 'notfound' | 'error' | 'active' | 'submitting' | 'done'
type TextSize = 'sm' | 'base' | 'lg'

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export function ExamRunner({ testId }: { testId: string }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [attempt, setAttempt] = useState<AttemptDTO | null>(null)
  const [payload, setPayload] = useState<ExamPayload | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [remaining, setRemaining] = useState<number | null>(null) // null = không giới hạn
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [modalStep, setModalStep] = useState<0 | 1 | 2>(0)
  const [showPassage, setShowPassage] = useState(true)
  const [contrast, setContrast] = useState(false)
  const [textSize, setTextSize] = useState<TextSize>('base')
  // W8 annotation: highlights (node-path anchor) + bookmark câu hỏi.
  const [highlights, setHighlights] = useState<HighlightAnchor[]>([])
  const [bookmarkedQs, setBookmarkedQs] = useState<string[]>([])
  const [hlPopup, setHlPopup] = useState<{ x: number; y: number; anchor: HighlightAnchor } | null>(null)

  const baseRemainingRef = useRef<number>(-1) // -1 = không giới hạn
  const loadAtRef = useRef<number>(0)
  const submittingRef = useRef(false)
  const autoSubmittedRef = useRef(false)
  const passageRootRef = useRef<HTMLDivElement | null>(null)

  const passages = (Array.isArray(payload?.passages) ? payload?.passages : []) as Passage[]
  const questions = (Array.isArray(payload?.questions) ? payload?.questions : []) as ExamQuestion[]
  const answeredCount = questions.filter((q) => isAnswered(answers[q.id])).length

  // --- Submit (manual + auto). Server idempotent; chống double bằng ref. ---
  const doSubmit = useCallback(async () => {
    if (submittingRef.current || !attempt) return
    submittingRef.current = true
    setModalStep(0)
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

  // --- Boot: POST start → (in_progress) GET payload ---
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const sr = await fetch(`/api/exam/${testId}/start`, { method: 'POST' })
        if (!active) return
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
        // W8: seed annotation từ server (restore qua reload).
        setHighlights(Array.isArray(att.highlights) ? (att.highlights as HighlightAnchor[]) : [])
        setBookmarkedQs(Array.isArray(att.bookmarked_qs) ? att.bookmarked_qs : [])
        if (att.status !== 'in_progress') {
          // Đã nộp/hết hạn trước đó → không mở lại.
          // Attempt đã terminal trước đó — DTO start không kèm điểm; xem lại điểm/đáp án ở /result (W8–9).
          setResult({ attempt_id: att.attempt_id, status: att.status as 'submitted' | 'expired', time_spent: 0, submitted_at: '', scored: false, raw_score: null, band: null })
          return setPhase('done')
        }

        const pr = await fetch(`/api/exam/${testId}`)
        if (!active) return
        const pb = await pr.json().catch(() => null)
        if (!pr.ok || !pb?.success) return setPhase('error')
        setPayload(pb.data as ExamPayload)

        // Seed timer từ server (reload → start tính lại time_remaining → không reset).
        baseRemainingRef.current = att.duration_sec > 0 ? att.time_remaining_sec : -1
        loadAtRef.current = Date.now()
        setRemaining(att.duration_sec > 0 ? att.time_remaining_sec : null)
        setPhase('active')
      } catch {
        if (active) setPhase('error')
      }
    })()
    return () => {
      active = false
    }
  }, [testId, router])

  // --- Timer tick (chỉ khi active + có giới hạn). Auto-submit khi hết giờ (1 lần). ---
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

  // --- W8 annotation persistence (optimistic + rollback). POST /api/attempts/[id]/annotations. ---
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

  // Selection trong passage → popup tạo highlight. Selection ngoài/empty → ẩn popup.
  const onPassageMouseUp = useCallback(() => {
    const root = passageRootRef.current
    if (!root) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return setHlPopup(null)
    const range = sel.getRangeAt(0)
    if (!rangeWithinRoot(root, range)) return setHlPopup(null)
    const anchor = anchorFromRange(root, range)
    if (!anchor) return setHlPopup(null)
    const rect = range.getBoundingClientRect()
    setHlPopup({ x: rect.left + rect.width / 2, y: rect.bottom, anchor })
  }, [])

  const addHighlight = useCallback(
    (note?: string) => {
      if (!hlPopup) return
      const a: HighlightAnchor = { ...hlPopup.anchor, id: newAnchorId(), createdAt: new Date().toISOString() }
      if (note && note.trim()) a.note = note.trim().slice(0, 2000)
      const prev = highlights
      const next = [...highlights, a]
      setHighlights(next)
      setHlPopup(null)
      window.getSelection()?.removeAllRanges()
      void persistAnnotations({ highlights: next }, () => setHighlights(prev))
    },
    [hlPopup, highlights, persistAnnotations],
  )

  const clearAllHighlights = useCallback(() => {
    const prev = highlights
    setHighlights([])
    void persistAnnotations({ highlights: [] }, () => setHighlights(prev))
  }, [highlights, persistAnnotations])

  const toggleQuestionBookmark = useCallback(
    (qid: string) => {
      const prev = bookmarkedQs
      const next = prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]
      setBookmarkedQs(next)
      void persistAnnotations({ bookmarked_qs: next }, () => setBookmarkedQs(prev))
    },
    [bookmarkedQs, persistAnnotations],
  )

  // Render highlight bằng CSS Highlight API (rebuild range mỗi lần DOM passage đổi → bền re-render).
  useEffect(() => {
    if (phase !== 'active') return
    const root = passageRootRef.current
    if (!root) return
    applyHighlights(root, highlights)
    return () => clearHighlights()
  }, [highlights, showPassage, textSize, contrast, phase, payload])

  const sizeCls = textSize === 'sm' ? 'text-sm' : textSize === 'lg' ? 'text-lg' : 'text-base'
  const rootCls = contrast ? 'bg-black text-white' : 'bg-slate-50 text-slate-900'

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
            Điểm: {result.raw_score}{result.max_score != null ? `/${result.max_score}` : ''}
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

  // ---------- Active exam ----------
  const limited = remaining !== null
  const lowTime = limited && (remaining as number) <= 60

  return (
    <div data-testid="exam-runner" className={`flex min-h-screen flex-col ${rootCls}`}>
      {/* Toolbar */}
      <header className={`sticky top-0 z-20 border-b ${contrast ? 'border-slate-700 bg-black' : 'border-slate-200 bg-white'}`}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5">
          <span className="truncate font-semibold">{payload?.test.title}</span>
          {payload?.test.skill && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{SKILL_LABEL[payload.test.skill]}</span>
          )}
          <span className={`ml-auto rounded px-2 py-1 text-sm font-medium tabular-nums ${lowTime ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
            ⏱ {limited ? clock(remaining as number) : 'Không giới hạn'}
          </span>
          <span className="text-sm text-slate-500">
            {answeredCount}/{questions.length} câu
          </span>
          <button
            onClick={() => setModalStep(1)}
            className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
          >
            Nộp bài
          </button>
        </div>
        {/* Progress + question nav */}
        <div className={`border-t ${contrast ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1.5 px-4 py-2">
            <div className="mr-2 h-1.5 w-28 overflow-hidden rounded bg-slate-200">
              <div className="h-full bg-teal-600" style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }} />
            </div>
            {questions.map((q, i) => {
              const done = isAnswered(answers[q.id])
              return (
                <a
                  key={q.id}
                  href={`#q-${q.id}`}
                  className={`flex h-6 w-6 items-center justify-center rounded text-xs ${done ? 'bg-teal-600 text-white' : contrast ? 'bg-slate-700 text-slate-100' : 'bg-slate-100 text-slate-600'}`}
                >
                  {q.number ?? i + 1}
                </a>
              )
            })}
            <button onClick={() => setShowPassage((v) => !v)} className="ml-auto text-xs text-slate-500 underline">
              {showPassage ? 'Ẩn đoạn văn' : 'Hiện đoạn văn'}
            </button>
            <button onClick={() => setContrast((v) => !v)} className="text-xs text-slate-500 underline">
              Tương phản
            </button>
            <select
              value={textSize}
              onChange={(e) => setTextSize(e.target.value as TextSize)}
              className="rounded border border-slate-300 bg-transparent px-1 text-xs text-slate-500"
              aria-label="Cỡ chữ"
            >
              <option value="sm">Chữ nhỏ</option>
              <option value="base">Chữ vừa</option>
              <option value="lg">Chữ lớn</option>
            </select>
          </div>
        </div>
      </header>

      {errorMsg && <p className="mx-auto max-w-6xl px-4 pt-2 text-sm text-red-600">{errorMsg}</p>}

      {/* Listening: audio player (signed URL sau guard). Reading/Writing → không render. */}
      {payload?.test.skill === 'listening' && (
        <div className="mx-auto w-full max-w-6xl px-4 pt-3">
          <ListeningAudioPlayer audioUrl={payload.audio_url} />
        </div>
      )}

      {/* 2 cột: Passage | Questions (mobile: stacked) */}
      <main className={`mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-5 ${showPassage ? 'lg:grid-cols-2' : ''} ${sizeCls}`}>
        {showPassage && (
          <section className={`rounded-lg border p-4 ${contrast ? 'border-slate-700' : 'border-slate-200 bg-white'} lg:max-h-[calc(100vh-9rem)] lg:overflow-auto`}>
            {highlights.length > 0 && (
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                <span>✏️ {highlights.length} đoạn tô sáng</span>
                <button onClick={clearAllHighlights} className="underline">Xóa tô sáng</button>
              </div>
            )}
            <div ref={passageRootRef} onMouseUp={onPassageMouseUp} onTouchEnd={onPassageMouseUp}>
              {passages.length === 0 ? (
                <p className="text-slate-400">Đề này không có đoạn văn.</p>
              ) : (
                passages.map((p) => (
                  <article key={p.id} className="mb-6 last:mb-0">
                    {p.title && <h2 className="mb-2 font-semibold">{p.title}</h2>}
                    <p className="whitespace-pre-line leading-relaxed">{p.content}</p>
                  </article>
                ))
              )}
            </div>
          </section>
        )}

        <section className={`rounded-lg border p-4 ${contrast ? 'border-slate-700' : 'border-slate-200 bg-white'}`}>
          {questions.length === 0 ? (
            <p className="text-slate-400">Đề này chưa có câu hỏi.</p>
          ) : (
            <ol className="space-y-5">
              {questions.map((q, i) => (
                <li key={q.id} id={`q-${q.id}`} className="scroll-mt-32">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold">{q.number ?? i + 1}.</span>
                    {q.type && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{q.type}</span>}
                    <button
                      type="button"
                      onClick={() => toggleQuestionBookmark(q.id)}
                      aria-pressed={bookmarkedQs.includes(q.id)}
                      aria-label={bookmarkedQs.includes(q.id) ? 'Bỏ đánh dấu câu' : 'Đánh dấu câu'}
                      title="Đánh dấu câu để xem lại"
                      className={`ml-auto text-sm ${bookmarkedQs.includes(q.id) ? 'text-amber-500' : 'text-slate-300 hover:text-slate-400'}`}
                    >
                      {bookmarkedQs.includes(q.id) ? '★' : '☆'}
                    </button>
                  </div>
                  {q.instruction && <p className="mt-1 text-slate-700">{q.instruction}</p>}
                  <div className="mt-2">
                    <QuestionRenderer
                      question={q}
                      value={answers[q.id]}
                      onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                      contrast={contrast}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>

      {/* W8 Highlight popup (selection trong passage) */}
      {hlPopup && (
        <HighlightPopup
          x={hlPopup.x}
          y={hlPopup.y}
          onHighlight={(note) => addHighlight(note)}
          onCancel={() => setHlPopup(null)}
        />
      )}

      {/* Submit modal 2 bước */}
      {modalStep > 0 && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 text-slate-900 shadow-xl">
            {modalStep === 1 ? (
              <>
                <h3 className="text-lg font-bold">Nộp bài?</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Đã trả lời <b>{answeredCount}</b>/{questions.length} câu.
                  {answeredCount < questions.length && (
                    <span className="text-amber-700"> Còn {questions.length - answeredCount} câu chưa trả lời.</span>
                  )}
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setModalStep(0)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
                    Tiếp tục làm
                  </button>
                  <button onClick={() => setModalStep(2)} className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white">
                    Nộp bài
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold">Xác nhận nộp bài</h3>
                <p className="mt-2 text-sm text-slate-600">Sau khi nộp, bạn không thể chỉnh sửa câu trả lời.</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setModalStep(1)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
                    Quay lại
                  </button>
                  <button onClick={() => void doSubmit()} className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white">
                    Xác nhận nộp
                  </button>
                </div>
              </>
            )}
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

// W8 — popup tạo highlight/note tại vị trí selection (viewport coords).
function HighlightPopup({
  x,
  y,
  onHighlight,
  onCancel,
}: {
  x: number
  y: number
  onHighlight: (note?: string) => void
  onCancel: () => void
}) {
  const [note, setNote] = useState('')
  const vw = typeof window !== 'undefined' ? window.innerWidth : 360
  const left = Math.min(Math.max(8, x - 112), vw - 232)
  return (
    <div
      className="fixed z-40 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
      style={{ left, top: y + 6 }}
      role="dialog"
      aria-label="Tạo tô sáng"
    >
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ghi chú (tùy chọn)…"
        rows={2}
        maxLength={2000}
        className="w-full resize-none rounded border border-slate-200 p-1.5 text-sm outline-none focus:border-teal-500"
      />
      <div className="mt-1.5 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded px-2 py-1 text-xs text-slate-500">
          Hủy
        </button>
        <button onClick={() => onHighlight(note)} className="rounded bg-amber-400 px-2 py-1 text-xs font-medium text-amber-950">
          Tô sáng
        </button>
      </div>
    </div>
  )
}
