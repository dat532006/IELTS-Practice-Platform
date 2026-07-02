'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { AttemptDTO, ExamPayload, WritingGradeResult } from '@/types/exam'
import { WritingResultView } from '@/components/writing/WritingResultView'

// W10 — Writing UI (M07). 2 cột: đề | vùng viết Task1+Task2; word count realtime; chấm qua /api/grade-writing.
// LUẬT THÉP #2/#12: KHÔNG import lib/scoring, KHÔNG tự tính band. overall_band = giá trị server.
type Phase = 'loading' | 'locked' | 'notfound' | 'error' | 'active' | 'submitting' | 'result'
type Passage = { id?: string; number?: number; title?: string; content?: string }

const T1_MIN = 150
const T2_MIN = 250
const countWords = (s: string): number => (s.trim().match(/\S+/g) ?? []).length

function getPrompts(payload: ExamPayload | null): { task1: Passage | null; task2: Passage | null } {
  const arr = Array.isArray(payload?.passages) ? (payload!.passages as Passage[]) : []
  const pick = (i: number, id: string) => arr.find((p) => p?.id === id) ?? arr[i] ?? null
  return { task1: pick(0, 'task1'), task2: pick(1, 'task2') }
}

function WordBadge({ wc, min }: { wc: number; min: number }) {
  const ok = wc >= min
  return (
    <span
      aria-live="polite"
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ok ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700'}`}
    >
      {wc} từ {ok ? '✓' : `(cần ≥${min})`}
    </span>
  )
}

export function WritingRunner({ testId }: { testId: string }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [attempt, setAttempt] = useState<AttemptDTO | null>(null)
  const [payload, setPayload] = useState<ExamPayload | null>(null)
  const [task1, setTask1] = useState('')
  const [task2, setTask2] = useState('')
  const [result, setResult] = useState<WritingGradeResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const sr = await fetch(`/api/exam/${testId}/start`, { method: 'POST' })
        if (!active) return
        if (sr.status === 401) {
          window.location.href = `/login?next=/writing/${testId}`
          return
        }
        if (sr.status === 403) return setPhase('locked')
        if (sr.status === 404) return setPhase('notfound')
        const sj = await sr.json().catch(() => null)
        if (!sr.ok || !sj?.data?.attempt_id) {
          setErrorMsg('Không bắt đầu được bài viết')
          return setPhase('error')
        }
        setAttempt(sj.data as AttemptDTO)
        const pr = await fetch(`/api/exam/${testId}`)
        const pj = await pr.json().catch(() => null)
        if (!active) return
        if (!pr.ok || !pj?.data) {
          setErrorMsg('Không tải được đề bài')
          return setPhase('error')
        }
        setPayload(pj.data as ExamPayload)
        setPhase('active')
      } catch {
        if (active) {
          setErrorMsg('Lỗi kết nối')
          setPhase('error')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [testId])

  const prompts = useMemo(() => getPrompts(payload), [payload])
  const wc1 = countWords(task1)
  const wc2 = countWords(task2)
  const canSubmit = wc1 >= T1_MIN && wc2 >= T2_MIN

  const submit = useCallback(async () => {
    if (!attempt) return
    setPhase('submitting')
    setErrorMsg('')
    try {
      const r = await fetch('/api/grade-writing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attempt_id: attempt.attempt_id, task1_text: task1, task2_text: task2 }),
      })
      const j = await r.json().catch(() => null)
      if (r.status === 200 && j?.data) {
        setResult(j.data as WritingGradeResult)
        return setPhase('result')
      }
      const code = j?.meta?.error_code
      if (r.status === 404) return setPhase('notfound')
      if (r.status === 429) setErrorMsg('Bạn đã dùng hết lượt chấm AI miễn phí hôm nay. Thử lại ngày mai hoặc nâng cấp Pro.')
      // B-05: attempt đã chấm xong là terminal — cần lượt mới (nút "Viết lại" tự tạo).
      else if (code === 'ATTEMPT_TERMINAL') setErrorMsg('Lượt làm này đã được chấm xong. Bấm "← Viết lại" để tạo lượt mới rồi nộp lại — bài viết của bạn vẫn được giữ nguyên.')
      else if (code === 'WORD_COUNT_TOO_LOW') setErrorMsg('Task 1 cần ≥150 từ và Task 2 cần ≥250 từ.')
      else if (r.status === 502) setErrorMsg('Hệ thống chấm AI tạm thời không khả dụng. Bài viết được giữ nguyên — vui lòng thử lại.')
      else setErrorMsg((j?.message as string) || 'Không chấm được bài. Vui lòng thử lại.')
      setPhase('active') // giữ nguyên bài viết
    } catch {
      setErrorMsg('Lỗi kết nối. Bài viết của bạn được giữ nguyên.')
      setPhase('active')
    }
  }, [attempt, task1, task2])

  // FE-F05 (khớp B-05): attempt bị finalize `submitted` ngay sau lần chấm đầu → chấm lại attempt cũ = 409.
  //   "Viết lại" phải xin attempt in_progress MỚI qua /start (idempotent: terminal không chặn tạo mới).
  //   Text bài viết giữ nguyên trong state — chỉ đổi attempt.
  const rewrite = useCallback(async () => {
    if (restarting) return
    setErrorMsg('')
    setRestarting(true)
    try {
      const sr = await fetch(`/api/exam/${testId}/start`, { method: 'POST' })
      const sj = await sr.json().catch(() => null)
      if (sr.ok && sj?.data?.attempt_id) {
        setAttempt(sj.data as AttemptDTO)
        setResult(null)
        setPhase('active')
      } else {
        setErrorMsg('Không tạo được lượt viết mới — vui lòng tải lại trang.')
      }
    } catch {
      setErrorMsg('Lỗi kết nối khi tạo lượt viết mới — vui lòng tải lại trang.')
    } finally {
      setRestarting(false)
    }
  }, [restarting, testId])

  // ---- States ----
  if (phase === 'loading') return <Centered>Đang tải bài viết…</Centered>
  if (phase === 'locked')
    return (
      <Centered>
        <p className="mb-3">Đề thi này cần được mở khóa trước khi làm bài.</p>
        <Link href="/products" className="text-teal-700 underline">
          Xem các gói đề
        </Link>
      </Centered>
    )
  if (phase === 'notfound') return <Centered>Không tìm thấy bài viết.</Centered>
  if (phase === 'error') return <Centered>{errorMsg || 'Đã có lỗi xảy ra.'}</Centered>

  const title = payload?.test?.title ?? 'Writing'

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-teal-600 text-sm font-bold text-white">IP</span>
          <div>
            <div className="font-semibold leading-tight">{title}</div>
            <div className="text-xs text-slate-500">IELTS Writing · Task 1 + Task 2</div>
          </div>
        </div>
      </header>

      {phase === 'result' && result ? (
        <main className="mx-auto max-w-6xl px-4 py-6">
          <WritingResultView result={result} essays={{ task1, task2 }} />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={rewrite}
              disabled={restarting}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {restarting ? 'Đang tạo lượt mới…' : '← Viết lại'}
            </button>
            <Link href={`/writing-result/${result.attempt_id}`} className="text-sm text-teal-700 underline">
              Xem lại kết quả này
            </Link>
            {errorMsg && <span className="text-sm text-red-600">{errorMsg}</span>}
          </div>
        </main>
      ) : (
        <main className="mx-auto grid max-w-6xl grid-cols-1 gap-5 px-4 py-6 lg:grid-cols-2">
          {/* Cột trái: đề bài */}
          <section className="space-y-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-auto lg:pr-2">
            {[prompts.task1, prompts.task2].map((p, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="mb-1 font-bold text-slate-800">{p?.title ?? `Writing Task ${i + 1}`}</h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                  {p?.content ?? 'Đề bài đang được cập nhật.'}
                </p>
              </div>
            ))}
          </section>

          {/* Cột phải: vùng viết */}
          <section className="space-y-5">
            {[
              { n: 1, val: task1, set: setTask1, wc: wc1, min: T1_MIN },
              { n: 2, val: task2, set: setTask2, wc: wc2, min: T2_MIN },
            ].map((t) => (
              <div key={t.n}>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor={`task${t.n}`} className="font-semibold text-slate-800">
                    Bài làm Task {t.n}
                  </label>
                  <WordBadge wc={t.wc} min={t.min} />
                </div>
                <textarea
                  id={`task${t.n}`}
                  value={t.val}
                  onChange={(e) => t.set(e.target.value)}
                  disabled={phase === 'submitting'}
                  rows={t.n === 1 ? 9 : 14}
                  placeholder={`Viết bài Task ${t.n} của bạn ở đây (tối thiểu ${t.min} từ)…`}
                  className="w-full resize-y rounded-md border border-slate-300 p-3 text-sm leading-relaxed focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-100"
                />
              </div>
            ))}

            {errorMsg && (
              <p aria-live="assertive" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMsg}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit || phase === 'submitting'}
                className="rounded-md bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {phase === 'submitting' ? 'Đang chấm…' : 'Nộp & chấm AI'}
              </button>
              {!canSubmit && (
                <span className="text-xs text-slate-500">Đủ {T1_MIN} từ (Task 1) và {T2_MIN} từ (Task 2) để nộp.</span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Bài chấm bằng AI, điểm chỉ mang tính tham khảo. Free: 1 lượt chấm/ngày.
            </p>
          </section>
        </main>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 text-center text-slate-700">
      <div>{children}</div>
    </div>
  )
}
