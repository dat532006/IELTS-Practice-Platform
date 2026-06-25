import type { WritingErrorHighlight } from '@/types/exam'

// W11 — Writing error highlights (M07). Render error_highlights từ DTO (đã Zod-sanitize ở BE).
// LUẬT THÉP: KHÔNG tự chấm; chỉ hiển thị DTO whitelist (quote/type/suggestion). KHÔNG system prompt/AI key.
//   essay (tuỳ chọn) = bài user tự nhập ở client (WritingRunner) → render qua React children (auto-escape).
//   Quote không khớp bài → KHÔNG tô (bỏ qua an toàn) nhưng vẫn liệt kê ở danh sách. Mobile/touch: danh sách
//   luôn hiển thị đầy đủ suggestion (không phụ thuộc hover tooltip).

const TYPE_LABELS: Record<WritingErrorHighlight['type'], string> = {
  task_response: 'Task Response',
  coherence_cohesion: 'Coherence & Cohesion',
  lexical_resource: 'Lexical Resource',
  grammar: 'Grammar',
}
const TYPE_BADGE: Record<WritingErrorHighlight['type'], string> = {
  task_response: 'bg-violet-100 text-violet-700',
  coherence_cohesion: 'bg-sky-100 text-sky-700',
  lexical_resource: 'bg-amber-100 text-amber-700',
  grammar: 'bg-rose-100 text-rose-700',
}
const typeLabel = (t: WritingErrorHighlight['type']) => TYPE_LABELS[t] ?? t
const typeBadge = (t: WritingErrorHighlight['type']) => TYPE_BADGE[t] ?? 'bg-slate-100 text-slate-600'

type Segment = { text: string; hl?: WritingErrorHighlight }

// Match KHÔNG chồng lấn của từng quote trong essay (exact, fallback case-insensitive). Pure, không đụng DOM.
function buildSegments(essay: string, highlights: WritingErrorHighlight[]): Segment[] {
  const ranges: { start: number; end: number; hl: WritingErrorHighlight }[] = []
  for (const hl of highlights) {
    const q = hl.quote
    if (!q) continue
    let idx = essay.indexOf(q)
    if (idx < 0) idx = essay.toLowerCase().indexOf(q.toLowerCase()) // forgiving: giữ index trong essay gốc
    if (idx < 0) continue
    ranges.push({ start: idx, end: idx + q.length, hl })
  }
  ranges.sort((a, b) => a.start - b.start)

  const segments: Segment[] = []
  let cursor = 0
  for (const r of ranges) {
    if (r.start < cursor) continue // chồng lấn → bỏ qua (giữ match trước)
    if (r.start > cursor) segments.push({ text: essay.slice(cursor, r.start) })
    segments.push({ text: essay.slice(r.start, r.end), hl: r.hl })
    cursor = r.end
  }
  if (cursor < essay.length) segments.push({ text: essay.slice(cursor) })
  return segments
}

export function WritingErrorHighlights({
  highlights,
  essay,
}: {
  highlights: WritingErrorHighlight[]
  essay?: string
}) {
  if (!highlights?.length) return null // degrade sạch khi không có highlight
  const segments = essay ? buildSegments(essay, highlights) : null

  return (
    <div className="mt-3">
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Lỗi &amp; gợi ý sửa</h4>

      {segments && (
        <p className="mb-2 whitespace-pre-line rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
          {segments.map((seg, i) =>
            seg.hl ? (
              <mark
                key={i}
                tabIndex={0}
                title={`${typeLabel(seg.hl.type)}: ${seg.hl.suggestion}`}
                aria-label={`Lỗi ${typeLabel(seg.hl.type)}: "${seg.hl.quote}". Gợi ý: ${seg.hl.suggestion}`}
                className="rounded-sm bg-amber-200 px-0.5 text-slate-900 underline decoration-amber-500 decoration-dotted underline-offset-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
      )}

      <ul className="space-y-1.5">
        {highlights.map((h, i) => (
          <li key={i} className="rounded-md border border-slate-200 bg-white p-2 text-sm">
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${typeBadge(h.type)}`}>
                {typeLabel(h.type)}
              </span>
              <q className="italic text-slate-600">{h.quote}</q>
            </div>
            <p className="text-slate-700">{h.suggestion}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
