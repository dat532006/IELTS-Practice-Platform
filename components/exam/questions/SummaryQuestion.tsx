// M06 — Summary completion NHIỀU chỗ trống trong 1 đoạn liền mạch (reference: "Complete the summary…").
// Gom câu type 'summary' liên tiếp → 1 khối: template (prompt chứa marker [n]) chèn ô nhập tại từng [n],
//   khớp câu theo `number`. Đoạn đầu KHÔNG có marker → tiêu đề căn giữa (như reference).
// Nếu có word-bank (options A–G, dạng "list of words") → hiện bank KÉO-THẢ; ô = drop target + gõ được.
// answer theo question.id (single value, khớp BE scoring). KHÔNG biết đáp án (LUẬT THÉP #2).
import { useState } from 'react'
import type { AnswerValue, ExamQuestion, QOption } from './types'

const MARKER = /(\[\d+\])/g // giữ delimiter khi split
const IS_MARKER = /^\[(\d+)\]$/

export function SummaryQuestion({
  questions,
  template,
  options,
  answers,
  onAnswer,
  readOnly = false,
}: {
  questions: ExamQuestion[]
  template: string
  options?: QOption[]
  answers: Record<string, AnswerValue>
  onAnswer: (qid: string, v: AnswerValue) => void
  readOnly?: boolean // EXAM-008: review mode → read-only hoàn toàn (không kéo/thả/chọn/gõ)
}) {
  const byNum = new Map<number, ExamQuestion>()
  for (const q of questions) if (typeof q.number === 'number') byNum.set(q.number, q)

  const hasBank = Array.isArray(options) && options.length > 0
  const [picked, setPicked] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // Ô LƯU chữ cái (BE chấm theo key), nhưng HIỆN từ trong bank — thả "B" thì đọc thấy "agriculture".
  const textOfKey = new Map((options ?? []).map((o) => [o.key, o.text || o.key]))

  const allowReuse = /more than once/i.test(questions[0]?.instruction ?? '')
  const used = new Set(questions.map((q) => answers[q.id]).filter((v): v is string => typeof v === 'string' && v !== ''))

  const paras = (template || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
  const hasMarker = (s: string) => /\[\d+\]/.test(s)

  // Bank mode: chuẩn hoá chữ + (nếu không cho lặp) TỰ CHUYỂN khỏi ô khác. Không bank: điền tự do.
  const place = (qid: string, raw: string) => {
    if (readOnly) return // EXAM-008: review không đổi đáp án
    if (!hasBank) { onAnswer(qid, raw); setPicked(null); return }
    const key = raw.toUpperCase().slice(0, 2)
    if (key && !allowReuse) {
      for (const other of questions) if (other.id !== qid && answers[other.id] === key) onAnswer(other.id, '')
    }
    onAnswer(qid, key)
    setPicked(null)
  }

  const renderPara = (text: string, key: number) => (
    <p key={key} className="rtext dcx-summary-p" style={{ textAlign: 'justify' }}>
      {text.split(MARKER).map((seg, i) => {
        const m = seg.match(IS_MARKER)
        if (!m) return <span key={i}>{seg}</span>
        const n = Number(m[1])
        const q = byNum.get(n)
        if (!q) return <span key={i}>{seg}</span> // marker không khớp câu → giữ literal
        const v = typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''
        // Bank: hiện TỪ, không hiện chữ cái. Không có bank: gõ tự do → hiện đúng cái đã gõ.
        const shown = hasBank ? (v ? textOfKey.get(v) ?? v : '') : v
        return (
          <span key={i} id={`q-${q.id}`} style={{ scrollMarginTop: 96 }}>
            <input
              type="text"
              autoComplete="off"
              value={shown}
              // Bank: ô chỉ nhận kéo-thả/chọn-rồi-bấm; gõ chữ cái xử lý ở onKeyDown (xem dưới).
              readOnly={readOnly || hasBank}
              onChange={hasBank ? undefined : (e) => place(q.id, e.target.value)}
              onKeyDown={readOnly || !hasBank ? undefined : (e) => {
                if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); place(q.id, ''); return }
                if (!/^[a-zA-Z]$/.test(e.key)) return
                const k = e.key.toUpperCase()
                if (!textOfKey.has(k)) return // chữ cái không có trong bank → bỏ qua
                e.preventDefault()
                place(q.id, k)
              }}
              onClick={() => { if (!readOnly && picked) place(q.id, picked) }}
              onDragOver={readOnly ? undefined : (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOverId(q.id) }}
              onDragLeave={readOnly ? undefined : () => setOverId((o) => (o === q.id ? null : o))}
              onDrop={readOnly ? undefined : (e) => {
                e.preventDefault()
                setOverId(null)
                const key = e.dataTransfer.getData('text/plain')
                if (key) place(q.id, key)
              }}
              placeholder={String(n)}
              aria-label={hasBank ? `Câu ${n} — kéo thẻ vào hoặc gõ chữ cái` : `Câu ${n}`}
              title={hasBank && v ? `${v} — ${shown}` : undefined}
              className={`dcx-gap-input${hasBank ? ' dcx-mbank-box' : ''}${overId === q.id ? ' drop-over' : ''}${hasBank && picked ? ' droppable' : ''}`}
              style={{
                margin: '0 6px',
                // Ô phải giãn theo độ dài TỪ, nếu không "agriculture" bị cắt trong khung 56px.
                ...(hasBank
                  ? { width: `calc(${Math.max(3, shown.length)}ch + 22px)`, maxWidth: '100%', textAlign: 'center' as const }
                  : {}),
              }}
            />
          </span>
        )
      })}
    </p>
  )

  return (
    <div className="dcx-summary">
      {hasBank && (
        <>
          {picked && <p className="dcx-drag-hint">Đang chọn <b>{picked}</b> — bấm vào ô trống để đặt (hoặc bấm lại thẻ để bỏ).</p>}
          <ul className="dcx-mbank-list dcx-summary-bank">
            {options!.map((o) => {
              const isUsed = !allowReuse && used.has(o.key)
              const locked = isUsed || readOnly // EXAM-008: review khoá tương tác thẻ
              return (
                <li
                  key={o.key}
                  className={`dcx-chip${picked === o.key ? ' picked' : ''}${isUsed ? ' used' : ''}`}
                  draggable={!locked}
                  onDragStart={(e) => {
                    if (locked) { e.preventDefault(); return }
                    e.dataTransfer.setData('text/plain', o.key)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  role="button"
                  tabIndex={locked ? -1 : 0}
                  aria-pressed={picked === o.key}
                  aria-disabled={locked}
                  onClick={() => { if (!locked) setPicked((p) => (p === o.key ? null : o.key)) }}
                  onKeyDown={(e) => {
                    if (locked) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setPicked((p) => (p === o.key ? null : o.key))
                    }
                  }}
                >
                  <b>{o.key}</b>
                  <span>{o.text || o.key}</span>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {paras.map((p, i) =>
        i === 0 && !hasMarker(p) ? (
          <div key={i} className="dcx-summary-title">
            {p}
          </div>
        ) : (
          renderPara(p, i)
        ),
      )}
    </div>
  )
}
