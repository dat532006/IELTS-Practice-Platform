'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AttemptDTO, ExamPayload, SubmitResult } from '@/types/exam'
import { SKILL_LABEL } from '@/lib/products/access-state'
import { QuestionRenderer } from '@/components/exam/questions/QuestionRenderer'
import { isAnswered, type AnswerValue, type ExamQuestion } from '@/components/exam/questions/types'

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

  const baseRemainingRef = useRef<number>(-1) // -1 = không giới hạn
  const loadAtRef = useRef<number>(0)
  const submittingRef = useRef(false)
  const autoSubmittedRef = useRef(false)

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
        <p className="mt-1 text-sm text-slate-400">Xem lại đáp án chi tiết sẽ có ở giai đoạn sau (W8–9 review).</p>
        <Link href="/products" className="mt-4 inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white">
          Về danh sách bộ đề
        </Link>
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

      {/* 2 cột: Passage | Questions (mobile: stacked) */}
      <main className={`mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-5 ${showPassage ? 'lg:grid-cols-2' : ''} ${sizeCls}`}>
        {showPassage && (
          <section className={`rounded-lg border p-4 ${contrast ? 'border-slate-700' : 'border-slate-200 bg-white'} lg:max-h-[calc(100vh-9rem)] lg:overflow-auto`}>
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
