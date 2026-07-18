'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { AttemptDTO, ExamPayload, WritingGradeResult } from '@/types/exam'
import { pickTaskPassage, isBlankHtml } from '@/lib/exam/writing-prompts'
import { FREE_GRADE_PER_DAY, GRADE_COST_COINS } from '@/lib/exam/writing-pricing'
import { WritingResultView } from '@/components/writing/WritingResultView'
import { WritingFeedback } from '@/components/writing/WritingFeedback'
import { A11yDialog } from '@/components/a11y/A11yDialog'
import { ClockIcon, MenuIcon, CloseIcon, CheckIcon, SparkleIcon, ArrowLeft } from '@/components/exam/ExamIcons'
import { Mascot } from '@/components/brand/Mascot'

// W10 — Writing UI (M07). dc-exam restyle: tab Task1/Task2 + 1 editor, word count realtime,
//   chấm qua /api/grade-writing → modal AI (band + 4 tiêu chí). LUẬT THÉP #2/#12: KHÔNG tự tính band.
type Phase = 'loading' | 'locked' | 'notfound' | 'error' | 'active' | 'submitting' | 'result'
type Passage = { id?: string; number?: number; title?: string; content?: string; image?: string; hint?: string }

// AI-010: đề soạn WYSIWYG là HTML rich → render qua dangerouslySetInnerHTML (đã sanitize server 2 lần:
//   lúc lưu + /api/exam trả). Bug cũ: render {content} như TEXT → học viên thấy nguyên thẻ <p>.
//   Regex nhận diện rich giống ExamRunner/passage-html (chỉ thẻ allowlist → không false-positive "a < b").
const RICH_RE = /<(\/?)(p|br|strong|b|em|i|u|s|h2|h3|ul|ol|li|span|div)(\s|>|\/)/i

const T1_MIN = 150
const T2_MIN = 250
const countWords = (s: string): number => (s.trim().match(/\S+/g) ?? []).length
// FB-04: đồng hồ đếm ngược — format mm:ss như ExamRunner.
const clock = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const CRITERIA: { key: 'task_response' | 'coherence_cohesion' | 'lexical_resource' | 'grammar'; label: string }[] = [
  { key: 'task_response', label: 'Task Achievement' },
  { key: 'coherence_cohesion', label: 'Coherence & Cohesion' },
  { key: 'lexical_resource', label: 'Lexical Resource' },
  { key: 'grammar', label: 'Grammatical Range' },
]

// AI-006: hợp đồng task1/task2 dùng CHUNG với lib/exam/writing.ts extractPrompts (hết copy tay 2 nơi).
function getPrompts(payload: ExamPayload | null): { task1: Passage | null; task2: Passage | null } {
  const arr = Array.isArray(payload?.passages) ? (payload!.passages as Passage[]) : []
  return { task1: pickTaskPassage(arr, 0, 'task1'), task2: pickTaskPassage(arr, 1, 'task2') }
}

// AI-012: preview mode cho admin (như ExamRunner) — payload bơm từ form, KHÔNG API/attempt/chấm.
export function WritingRunner({ testId, preview }: { testId: string; preview?: { payload: ExamPayload } }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [attempt, setAttempt] = useState<AttemptDTO | null>(null)
  const [payload, setPayload] = useState<ExamPayload | null>(null)
  const [task1, setTask1] = useState('')
  const [task2, setTask2] = useState('')
  const [tab, setTab] = useState<1 | 2>(1)
  const [result, setResult] = useState<WritingGradeResult | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  // FB-04 (Owner 2026-07-18): modal điểm có tab Task 1/Task 2 RIÊNG (không ăn theo tab editor —
  //   trước đây viết xong ở tab 2 thì modal chỉ hiện điểm Task 2, không có cách xem Task 1).
  const [modalTab, setModalTab] = useState<1 | 2>(1)
  const [errorMsg, setErrorMsg] = useState('')
  const [needTopup, setNeedTopup] = useState(false) // pay-per-grade: hết free + thiếu coins → hiện link nạp
  const [restarting, setRestarting] = useState(false)
  // AI-014: gợi ý mở theo TỪNG task (mở task 1 không tự đóng khi mở task 2).
  const [hintOpen, setHintOpen] = useState<Record<number, boolean>>({})
  // FB-04: timer server-anchored (pattern ExamRunner) — neo time_remaining_sec tại lúc load attempt,
  //   đếm bằng timestamp (sleep-safe), hết giờ TỰ NỘP cho AI đúng 1 lần.
  const [remaining, setRemaining] = useState<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const baseRemainingRef = useRef(-1)
  const loadAtRef = useRef(0)
  const autoSubmittedRef = useRef(false)
  // FB-05: màn loading khi AI đang chấm (thường 30–90s với reasoning model) — đếm elapsed để đổi
  //   thông điệp theo giai đoạn + progress; chặn đóng trang giữa chừng (request đã gửi là đã tính tiền).
  const [gradeElapsed, setGradeElapsed] = useState(0)
  const gradeStartRef = useRef(0)

  // FB-04: neo timer vào attempt hiện tại — time_remaining_sec do SERVER tính từ started_at
  //   (resume/reload không reset đồng hồ); duration_sec = 0/null → đề không giới hạn giờ, không timer.
  const anchorTimer = useCallback((att: AttemptDTO) => {
    baseRemainingRef.current = att.duration_sec > 0 ? att.time_remaining_sec : -1
    loadAtRef.current = Date.now()
    // FB-06: attempt load về đã HẾT GIỜ sẵn (edge — server startAttempt giờ tự expire + cấp attempt
    //   mới cho writing, nhưng phòng dữ liệu cũ/race): chỉ hiện 00:00, KHÔNG auto-submit bài rỗng.
    autoSubmittedRef.current = att.duration_sec > 0 && att.time_remaining_sec <= 0
    setTimedOut(false)
    setRemaining(att.duration_sec > 0 ? att.time_remaining_sec : null)
  }, [])

  useEffect(() => {
    // AI-012: preview — payload có sẵn từ form admin, không tạo attempt, không gọi API nào.
    if (preview) {
      setPayload(preview.payload)
      setPhase('active')
      return
    }
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
        anchorTimer(sj.data as AttemptDTO)
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
  }, [testId, preview, anchorTimer])

  const prompts = useMemo(() => getPrompts(payload), [payload])
  const wc1 = countWords(task1)
  const wc2 = countWords(task2)
  const canSubmit = wc1 >= T1_MIN && wc2 >= T2_MIN

  const submit = useCallback(async () => {
    if (!attempt) return
    setPhase('submitting')
    setErrorMsg('')
    setNeedTopup(false)
    try {
      const r = await fetch('/api/grade-writing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attempt_id: attempt.attempt_id, task1_text: task1, task2_text: task2 }),
      })
      const j = await r.json().catch(() => null)
      if (r.status === 200 && j?.data) {
        setResult(j.data as WritingGradeResult)
        setModalTab(1) // FB-04: modal luôn mở từ Task 1 (đọc theo thứ tự), có tab chuyển sang Task 2
        setAiOpen(true)
        return setPhase('active')
      }
      const code = j?.meta?.error_code
      if (r.status === 404) return setPhase('notfound')
      if (code === 'INSUFFICIENT_COINS') {
        // Hết lượt free/ngày và không đủ coins → dùng message server (kèm số dư/giá) + link nạp.
        setErrorMsg((j?.message as string) || `Bạn cần ${GRADE_COST_COINS} coins để chấm thêm lượt hôm nay.`)
        setNeedTopup(true)
      } else if (r.status === 429) setErrorMsg('Bạn đã chạm giới hạn chấm AI trong hôm nay, vui lòng thử lại sau.')
      else if (code === 'ATTEMPT_TERMINAL') setErrorMsg('Lượt làm này đã được chấm xong. Bấm "← Viết lại" để tạo lượt mới rồi nộp lại — bài viết của bạn vẫn được giữ nguyên.')
      else if (code === 'WORD_COUNT_TOO_LOW') setErrorMsg('Task 1 cần ≥150 từ và Task 2 cần ≥250 từ.')
      else if (r.status === 502) setErrorMsg('Hệ thống chấm AI tạm thời không khả dụng. Bài viết được giữ nguyên — vui lòng thử lại.')
      else setErrorMsg((j?.message as string) || 'Không chấm được bài. Vui lòng thử lại.')
      setPhase('active')
    } catch {
      setErrorMsg('Lỗi kết nối. Bài viết của bạn được giữ nguyên.')
      setPhase('active')
    }
  }, [attempt, task1, task2])

  // FE-F05: "Viết lại" xin attempt in_progress MỚI; text giữ nguyên.
  const rewrite = useCallback(async () => {
    if (restarting) return
    setErrorMsg('')
    setRestarting(true)
    try {
      const sr = await fetch(`/api/exam/${testId}/start`, { method: 'POST' })
      const sj = await sr.json().catch(() => null)
      if (sr.ok && sj?.data?.attempt_id) {
        setAttempt(sj.data as AttemptDTO)
        anchorTimer(sj.data as AttemptDTO) // FB-04: lượt mới → đồng hồ mới, cho phép auto-submit lại
        setResult(null)
        setAiOpen(false)
        setPhase('active')
      } else {
        setErrorMsg('Không tạo được lượt viết mới — vui lòng tải lại trang.')
      }
    } catch {
      setErrorMsg('Lỗi kết nối khi tạo lượt viết mới — vui lòng tải lại trang.')
    } finally {
      setRestarting(false)
    }
  }, [restarting, testId, anchorTimer])

  // FB-05 — Trong lúc chấm: đếm elapsed cho overlay loading + chặn đóng trang (beforeunload).
  //   Request chấm đã bay đi là provider đã xử lý/tính tiền — đóng tab chỉ làm mất kết quả.
  useEffect(() => {
    if (phase !== 'submitting') return
    gradeStartRef.current = Date.now()
    setGradeElapsed(0)
    const t = setInterval(() => setGradeElapsed((Date.now() - gradeStartRef.current) / 1000), 1000)
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      clearInterval(t)
      window.removeEventListener('beforeunload', warn)
    }
  }, [phase])

  // FB-04 — Đồng hồ đếm ngược + tự nộp khi hết giờ (Owner 2026-07-18). Đếm bằng timestamp
  //   (sleep-safe, pattern ExamRunner); hết giờ → gọi ĐÚNG submit() hiện có, đúng 1 lần/attempt
  //   (autoSubmittedRef). Bài chưa đủ từ thì server trả WORD_COUNT_TOO_LOW → errorMsg hiện như thường,
  //   học viên vẫn sửa và nộp tay được (server không khoá attempt theo giờ). Đã chấm xong (result)
  //   thì dừng — không auto-submit lượt đã terminal.
  useEffect(() => {
    if (preview || phase === 'result' || result || baseRemainingRef.current < 0) return
    if (phase !== 'active' && phase !== 'submitting') return
    const tick = () => {
      const rem = Math.max(0, baseRemainingRef.current - (Date.now() - loadAtRef.current) / 1000)
      setRemaining(rem)
      if (rem <= 0 && !autoSubmittedRef.current && phase === 'active') {
        autoSubmittedRef.current = true
        setTimedOut(true)
        // FB-06: cả 2 task trống → không có gì để chấm, đừng bắn request rỗng (Zod 400 khó hiểu).
        if (countWords(task1) === 0 && countWords(task2) === 0) {
          setErrorMsg('⏰ Hết giờ — bạn chưa viết nội dung nào nên không có gì để chấm. Tải lại trang để bắt đầu lượt mới.')
        } else {
          void submit()
        }
      }
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [phase, preview, result, submit, task1, task2])

  // ---- Non-editor states ----
  if (phase === 'loading') return <Centered>Đang tải bài viết…</Centered>
  if (phase === 'locked')
    return (
      <Centered>
        <p style={{ marginBottom: 12 }}>Đề thi này cần được mở khóa trước khi làm bài.</p>
        <Link href="/products" className="dcx-link">Xem các gói đề</Link>
      </Centered>
    )
  if (phase === 'notfound') return <Centered>Không tìm thấy bài viết.</Centered>
  if (phase === 'error') return <Centered>{errorMsg || 'Đã có lỗi xảy ra.'}</Centered>

  const title = payload?.test?.title ?? 'Writing'
  const activeVal = tab === 1 ? task1 : task2
  const setActive = tab === 1 ? setTask1 : setTask2
  const activeWc = tab === 1 ? wc1 : wc2
  const activeMin = tab === 1 ? T1_MIN : T2_MIN
  const wcOk = activeWc >= activeMin
  const submitting = phase === 'submitting'
  // FB-04: modal điểm đọc theo modalTab (tab RIÊNG của modal), không ăn theo tab editor.
  const modalGrade = result ? (modalTab === 1 ? result.task1 : result.task2) : null

  // ---- Result phase (chi tiết đầy đủ — WritingResultView) ----
  if (phase === 'result' && result) {
    return (
      <div className="dc-exam ct-bw ts-regular">
        <Header title={title} />
        <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px 60px' }}>
          <WritingResultView result={result} essays={{ task1, task2 }} />
          <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <button onClick={rewrite} disabled={restarting} className="dcx-btn-ghost" style={{ padding: '10px 18px', fontSize: 14 }}>
              {restarting ? 'Đang tạo lượt mới…' : '← Viết lại'}
            </button>
            <Link href={`/writing-result/${result.attempt_id}`} className="dcx-link">
              Xem lại kết quả này
            </Link>
            {errorMsg && <span style={{ color: 'var(--coral-deep)', fontSize: 14 }}>{errorMsg}</span>}
          </div>
        </main>
      </div>
    )
  }

  // ---- Editor ----
  return (
    <div className="dc-exam ct-bw ts-regular">
      <div className="dcx-shell">
        <Header title={title} remaining={result ? null : remaining} />

        {/* Banner + tabs */}
        <div className="dcx-w-banner">
          <div className="dcx-w-banner-row">
            <span className="dcx-badge">Writing</span>
            <div className="dcx-w-tabs">
              <button className={`dcx-w-tab${tab === 1 ? ' on' : ''}`} onClick={() => setTab(1)}>Task 1</button>
              <button className={`dcx-w-tab${tab === 2 ? ' on' : ''}`} onClick={() => setTab(2)}>Task 2</button>
            </div>
            <div className="dcx-w-meta">
              {tab === 1 ? (
                <>Bạn nên dành khoảng <b>20 phút</b> · tối thiểu <b>150 từ</b></>
              ) : (
                <>Bạn nên dành khoảng <b>40 phút</b> · tối thiểu <b>250 từ</b></>
              )}
            </div>
          </div>
        </div>

        {/* Split: prompt | editor */}
        <div className="dcx-w-split">
          <div className="dcx-w-prompt">
            {(() => {
              const cur = tab === 1 ? prompts.task1 : prompts.task2
              const raw = cur?.content ?? ''
              return RICH_RE.test(raw) ? (
                <div className="dcx-w-prompt-text dcx-rich" dangerouslySetInnerHTML={{ __html: raw }} />
              ) : (
                <div className="dcx-w-prompt-text">{raw || 'Đề bài đang được cập nhật.'}</div>
              )
            })()}
            {/* AI-010: biểu đồ/hình kèm đề (passage.image — URL đã qua allowlist server). Không có ảnh
                thì KHÔNG render khung giả "[ hình minh hoạ ]" nữa (gây hiểu lầm đề thiếu hình). */}
            {(tab === 1 ? prompts.task1 : prompts.task2)?.image && (
              <div className="dcx-w-chart">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={(tab === 1 ? prompts.task1 : prompts.task2)!.image}
                  alt={`Biểu đồ/hình kèm đề bài Task ${tab}`}
                  style={{ maxWidth: '100%', borderRadius: 8 }}
                />
              </div>
            )}
            {/* AI-014/015: gợi ý do ADMIN soạn rich theo đề (passage.hint). Nút vuông nhỏ 💡 TOGGLE
                (bấm mở, bấm lại đóng — Owner 2026-07-17). Rỗng HTML vỏ = không nút. Rich → đã
                sanitize server 2 lần → dangerouslySetInnerHTML; hint plain cũ giữ nhánh text. */}
            {(() => {
              const hint = (tab === 1 ? prompts.task1 : prompts.task2)?.hint
              if (typeof hint !== 'string' || isBlankHtml(hint)) return null
              // Nút đứng NGOÀI khung: đóng = chỉ còn đúng nút vuông (khung .dcx-w-hint có nền/padding,
              // để nút bên trong là lúc đóng vẽ ra hộp rỗng to đùng — Owner báo 2026-07-17).
              return (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    aria-expanded={!!hintOpen[tab]}
                    aria-label={hintOpen[tab] ? 'Đóng gợi ý dàn bài' : 'Xem gợi ý dàn bài'}
                    title="Gợi ý dàn bài"
                    onClick={() => setHintOpen((h) => ({ ...h, [tab]: !h[tab] }))}
                    style={{
                      height: 34, padding: '0 12px', borderRadius: 8, fontSize: 13.5, fontWeight: 700,
                      cursor: 'pointer', color: '#5B43C7',
                      border: '1px solid #D9CFF2', background: hintOpen[tab] ? '#F0ECFF' : '#fff',
                    }}
                  >
                    💡 Gợi ý dàn bài
                  </button>
                  {hintOpen[tab] && (
                    <div className="dcx-w-hint" style={{ marginTop: 8 }}>
                      {RICH_RE.test(hint) ? (
                        <div className="dcx-w-hint-body dcx-rich" dangerouslySetInnerHTML={{ __html: hint }} />
                      ) : (
                        <div className="dcx-w-hint-body" style={{ whiteSpace: 'pre-line' }}>{hint}</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          <div className="dcx-w-vsep" />

          <div className="dcx-w-editor-col">
            <div className="dcx-w-editor-inner">
              <div className="dcx-w-editor-head">
                <span className="dcx-w-editor-eyebrow">Bài làm của bạn · Task {tab}</span>
                <span className="dcx-w-count-wrap">
                  <span className="dcx-w-count-lbl">Số từ:</span>
                  <span className="dcx-w-count">{activeWc}</span>
                  <span className={`dcx-w-count-badge${wcOk ? ' ok' : ''}`}>
                    {wcOk ? 'đạt yêu cầu ✓' : `chưa đủ ${activeMin} từ`}
                  </span>
                </span>
              </div>
              <textarea
                className="dcx-w-textarea"
                value={activeVal}
                onChange={(e) => setActive(e.target.value)}
                disabled={submitting}
                placeholder={`Bắt đầu viết bài Task ${tab} của bạn ở đây… (tối thiểu ${activeMin} từ)`}
                aria-label={`Bài làm Task ${tab}`}
              />
              {errorMsg && (
                <p className="dcx-w-alert" style={{ marginTop: 12 }}>
                  {errorMsg}
                  {needTopup && (
                    <>
                      {' '}
                      <Link href="/pricing" className="dcx-link">Nạp coins →</Link>
                    </>
                  )}
                </p>
              )}
              {/* AI-013 (Owner 2026-07-17): nộp và chấm là MỘT hành động (1 lần gọi API, 1 lần/bài) —
                  bỏ nút "Chấm bằng AI" riêng (gợi ý sai rằng chấm thử được trước khi nộp). CTA duy nhất
                  ở footer: "Nộp bài & chấm AI". */}
              <div className="dcx-w-editor-actions">
                <span className="dcx-w-grade-note">
                  {preview
                    ? 'Chế độ xem trước (admin) — không tạo bài làm, không chấm.'
                    : canSubmit
                      ? `Nộp bài ở nút dưới — AI chấm ngay khi nộp (4 tiêu chí band descriptor, 1 lần/bài). Miễn phí ${FREE_GRADE_PER_DAY} lượt/ngày, sau đó ${GRADE_COST_COINS} coins/lượt.`
                      : `Cần đủ ${T1_MIN} từ (Task 1) và ${T2_MIN} từ (Task 2) mới nộp được.`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="dcx-w-footer">
          <span className="dcx-w-footer-note">
            {preview
              ? 'Xem trước — nút nộp bị khoá.'
              : timedOut && !result
                ? '⏰ Hết giờ — hệ thống đã tự nộp bài cho AI.'
                : 'Task 1 & Task 2 nộp cùng lúc · nộp xong AI chấm ngay.'}
          </span>
          <button className="dcx-submit" onClick={submit} disabled={!!preview || !canSubmit || submitting}>
            {submitting ? 'Đang nộp & chấm…' : 'Nộp bài & chấm AI'} <CheckIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* FB-05: overlay loading khi AI đang chấm — che toàn màn, không đóng được (không hủy được
          request đã gửi; hủy client cũng không dừng tính tiền provider). */}
      {submitting && <GradingOverlay elapsed={gradeElapsed} />}

      {/* AI result modal */}
      {aiOpen && modalGrade && result && (
        <div className="dcx-overlay" onClick={() => setAiOpen(false)}>
          <A11yDialog className="dcx-ai-modal" onClose={() => setAiOpen(false)} labelledBy="dcx-ai-title" onClick={(e) => e.stopPropagation()}>
            <div className="dcx-ai-head">
              <button className="dcx-ai-close" onClick={() => setAiOpen(false)} aria-label="Đóng">
                <CloseIcon className="h-4 w-4" />
              </button>
              <div className="dcx-ai-head-row">
                <div>
                  <div id="dcx-ai-title" className="dcx-ai-band-lbl">Band ước tính (Task {modalTab}) · Overall {result.overall_band.toFixed(1)}</div>
                  <div className="dcx-ai-band">{modalGrade.band.toFixed(1)}</div>
                </div>
                <span className="dcx-ai-tag">✦ AI đã chấm</span>
              </div>
              {/* FB-04 (Owner 2026-07-18): tab chuyển Task 1/Task 2 NGAY trong modal điểm — trước đây
                  modal ăn theo tab editor (thường đang ở Task 2 lúc nộp) nên không xem được điểm Task 1
                  cho tới khi bấm "Xem kết quả đầy đủ". */}
              <div className="dcx-w-tabs" role="tablist" aria-label="Chuyển task để xem điểm" style={{ marginTop: 12 }}>
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    role="tab"
                    aria-selected={modalTab === n}
                    className={`dcx-w-tab${modalTab === n ? ' on' : ''}`}
                    onClick={() => setModalTab(n)}
                  >
                    Task {n} · {(n === 1 ? result.task1 : result.task2).band.toFixed(1)}
                  </button>
                ))}
              </div>
            </div>
            {result.mock && (
              <div className="dcx-ai-mock">
                ⚠️ AI grader chưa cấu hình — đây là điểm <b>mô phỏng</b> để minh hoạ giao diện, không phản ánh chất lượng bài viết.
              </div>
            )}
            <div className="dcx-ai-body">
              {!result.mock && (result.coins_charged ?? 0) > 0 && (
                <p style={{ margin: '0 0 14px', fontSize: 13, color: '#857f96' }}>
                  Đã dùng <b>{result.coins_charged}</b> coins cho lượt chấm này.
                </p>
              )}
              <div className="dcx-ai-bars">
                {CRITERIA.map((c) => {
                  const val = modalGrade.criteria[c.key]
                  return (
                    <div key={c.key}>
                      <div className="dcx-ai-bar-hdr">
                        <span>{c.label}</span>
                        <span>{Number(val).toFixed(1)}</span>
                      </div>
                      <div className="dcx-ai-bar-track">
                        <div className="dcx-ai-bar-fill" style={{ width: `${Math.max(0, Math.min(9, val)) / 9 * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              {modalGrade.feedback && (
                <div className="mt-5">
                  <WritingFeedback feedback={modalGrade.feedback} compact />
                </div>
              )}
              {modalGrade.suggestions?.length > 0 && (
                <div className="dcx-ai-tip">
                  <b>Gợi ý · </b>
                  {modalGrade.suggestions[0]}
                </div>
              )}
              <div className="dcx-modal-actions" style={{ marginTop: 20, justifyContent: 'flex-start' }}>
                <button className="dcx-btn-primary" onClick={() => { setAiOpen(false); setPhase('result') }}>
                  Xem kết quả đầy đủ
                </button>
                <button className="dcx-btn-ghost" onClick={rewrite} disabled={restarting}>
                  <ArrowLeft className="h-4 w-4" /> {restarting ? 'Đang tạo lượt mới…' : 'Viết lại'}
                </button>
              </div>
            </div>
          </A11yDialog>
        </div>
      )}
    </div>
  )
}

// FB-05 — Màn loading lúc chấm AI. Thông điệp đổi theo THỜI GIAN đã chờ (tiến trình thật không đo
//   được — 1 request duy nhất), progress tiệm cận 94% (không bao giờ tự đầy — tránh "100% mà chưa
//   xong"). Thời lượng thật quan sát trên prod: ~30–90s (gpt-5.6-terra, effort medium).
const GRADING_STAGES: Array<[number, string]> = [
  [0, 'Đang gửi bài viết cho giám khảo AI…'],
  [7, 'AI đang đọc Task 1 và Task 2 của bạn…'],
  [20, 'Đang đối chiếu 4 tiêu chí band descriptor…'],
  [35, 'Đang viết nhận xét chi tiết và bản sửa lỗi…'],
  [50, 'Đang tổng hợp lộ trình cải thiện…'],
  [70, 'Sắp xong — bài dài có thể mất hơn 1 phút, cảm ơn bạn đã chờ…'],
]

function GradingOverlay({ elapsed }: { elapsed: number }) {
  const stage = [...GRADING_STAGES].reverse().find(([at]) => elapsed >= at)?.[1] ?? GRADING_STAGES[0][1]
  const pct = Math.min(94, Math.round(100 * (1 - Math.exp(-elapsed / 35))))
  return (
    <div className="dcx-overlay" role="status" aria-live="polite" aria-label="AI đang chấm bài viết">
      <div className="dcx-w-grading-card">
        <div className="dcx-w-grading-mascot">
          <span className="dcx-w-grading-ring" aria-hidden />
          <Mascot size={62} />
        </div>
        <h2 className="dcx-w-grading-title">AI đang chấm bài của bạn</h2>
        <p className="dcx-w-grading-stage">{stage}</p>
        <div className="dcx-w-grading-track" aria-hidden>
          <div className="dcx-w-grading-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="dcx-w-grading-note">
          Đã chờ <b>{clock(elapsed)}</b> · thường mất 30–90 giây · vui lòng không đóng trang
        </p>
      </div>
    </div>
  )
}

function Header({ title, remaining }: { title: string; remaining?: number | null }) {
  // FB-04: pill đếm ngược như ExamRunner — đỏ khi còn ≤60s. remaining null/undefined → không hiện
  //   (đề không giới hạn giờ, preview, hoặc đã chấm xong).
  const low = remaining != null && remaining <= 60
  return (
    <header className="dcx-header">
      <div className="dcx-header-inner">
        <div className="dcx-logo">
          <span className="dcx-logo-mark"><Mascot size={40} /></span>
          <div className="dcx-brand">
            <span className="dcx-brand-name"><b>IELTS</b>Practice</span>
            <span className="dcx-subtitle">{title} · IELTS Writing · Task 1 + Task 2</span>
          </div>
        </div>
        <div className="dcx-header-spacer" />
        {remaining != null && (
          <div className={`dcx-timer${low ? ' low' : ''}`}>
            <span style={{ color: 'var(--brand)', display: 'flex' }}>
              <ClockIcon className="h-[18px] w-[18px]" />
            </span>
            <span className="dcx-timer-val">{clock(remaining)}</span>
            <span className="dcx-timer-lbl">còn lại</span>
          </div>
        )}
        <button className="dcx-opts-btn" aria-label="Menu" disabled>
          <MenuIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="dc-exam ct-bw ts-regular">
      <div className="dcx-center">
        <div className="dcx-center-card">{children}</div>
      </div>
    </div>
  )
}
