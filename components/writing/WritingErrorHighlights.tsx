'use client'

import { useId } from 'react'
import type { WritingErrorHighlight } from '@/types/exam'
import { buildSegments } from '@/lib/writing/highlight-segments'
import { diffWords, hasUsefulFix } from '@/lib/writing/word-diff'

// W11 — Writing error highlights (M07). Render error_highlights từ DTO (đã Zod-sanitize ở BE).
// LUẬT THÉP: KHÔNG tự chấm; chỉ hiển thị DTO whitelist (quote/type/suggestion/fix/reason_vi).
//   KHÔNG system prompt/AI key. essay = bài của CHÍNH owner (từ client state hoặc DTO owner-only)
//   → render qua React children (auto-escape). Quote không khớp bài → KHÔNG tô nhưng vẫn có card.
// FB-01 (Owner 2026-07-18): card lỗi dạng trước/sau — quote với phần sai GẠCH ĐỎ, fix với phần
//   thay đổi NỀN XANH (diff từng từ, lib/writing/word-diff). reason_vi giải thích tiếng Việt.
//   Bài chấm cũ không có fix/reason_vi → fallback hiển thị suggestion như trước. Đánh số [n]
//   đồng bộ giữa vết tô trong bài và card; bấm "Xem trong bài" cuộn tới đúng vị trí lỗi.

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

// Dòng quote với phần bị bỏ/thay GẠCH ĐỎ (op 'del').
function BeforeLine({ quote, fix }: { quote: string; fix: string }) {
  const { before } = diffWords(quote, fix)
  return (
    <span className="leading-relaxed">
      {before.map((t, i) => (
        <span key={i}>
          {t.op === 'del' ? (
            <span className="rounded-sm bg-rose-50 px-0.5 font-semibold text-rose-700 line-through decoration-rose-400 decoration-2">
              {t.text}
            </span>
          ) : (
            t.text
          )}
          {i < before.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  )
}

// Dòng fix với phần mới/thay thế NỀN XANH (op 'ins') — "in màu phần sửa".
function AfterLine({ quote, fix }: { quote: string; fix: string }) {
  const { after } = diffWords(quote, fix)
  return (
    <span className="leading-relaxed">
      {after.map((t, i) => (
        <span key={i}>
          {t.op === 'ins' ? (
            <span className="rounded-sm bg-emerald-600 px-1 font-semibold text-white">{t.text}</span>
          ) : (
            t.text
          )}
          {i < after.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  )
}

export function WritingErrorHighlights({
  highlights,
  essay,
}: {
  highlights: WritingErrorHighlight[]
  essay?: string
}) {
  const uid = useId()
  if (!highlights?.length) return null // degrade sạch khi không có highlight

  const segments = essay ? buildSegments(essay, highlights) : null
  // Highlight nào thật sự tô được trong bài (quote khớp) → card mới có nút "Xem trong bài".
  const anchored = new Set(segments?.filter((s) => s.hl).map((s) => s.hl))
  const markId = (index: number) => `${uid}-hl-${index}`

  const scrollToMark = (index: number) => {
    const el = document.getElementById(markId(index))
    if (!el) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
    el.focus({ preventScroll: true })
  }

  return (
    <div>
      <div className="mb-3">
        <h4 className="text-sm font-extrabold text-[#2A2740]">Lỗi &amp; gợi ý sửa</h4>
        <p className="mt-1 text-xs font-medium text-[#9D96AE]">
          Từng lỗi trong bài: chỗ sai <span className="font-semibold text-rose-600 line-through">gạch đỏ</span>, phần sửa{' '}
          <span className="rounded-sm bg-emerald-600 px-1 font-semibold text-white">tô xanh</span>, kèm giải thích vì sao.
        </p>
      </div>

      {segments && (
        <p className="mb-3 whitespace-pre-line rounded-[14px] border border-[#ECE7F3] bg-[#FDFCFA] p-4 text-sm leading-[1.8] text-[#514B63]">
          {segments.map((seg, i) => {
            if (!seg.hl) return <span key={i}>{seg.text}</span>
            const index = highlights.indexOf(seg.hl)
            return (
              <mark
                key={i}
                id={index >= 0 ? markId(index) : undefined}
                tabIndex={0}
                title={`${typeLabel(seg.hl.type)}: ${seg.hl.suggestion}`}
                aria-label={`Lỗi ${index >= 0 ? index + 1 : ''} ${typeLabel(seg.hl.type)}: "${seg.hl.quote}". Gợi ý: ${seg.hl.suggestion}`}
                className="rounded-sm bg-amber-200 px-0.5 text-slate-900 underline decoration-amber-500 decoration-dotted underline-offset-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {index >= 0 && (
                  <sup className="mr-0.5 select-none rounded-sm bg-amber-500 px-1 text-[9px] font-extrabold text-white" aria-hidden>
                    {index + 1}
                  </sup>
                )}
                {seg.text}
              </mark>
            )
          })}
        </p>
      )}

      <ul className="space-y-2.5">
        {highlights.map((h, i) => {
          const fix = h.fix
          const useful = hasUsefulFix(h.quote, fix)
          const reason = h.reason_vi?.trim() || h.suggestion
          return (
            <li key={i} className="rounded-[14px] border border-[#ECE7F3] bg-white p-3.5 text-sm shadow-[0_10px_24px_-22px_rgba(42,39,64,0.55)]">
              <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-amber-500 text-[10px] font-extrabold text-white" aria-hidden>
                  {i + 1}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${typeBadge(h.type)}`}>
                  {typeLabel(h.type)}
                </span>
                {anchored.has(h) && (
                  <button
                    type="button"
                    onClick={() => scrollToMark(i)}
                    className="ml-auto rounded-md border border-[#E5DDF2] px-2 py-0.5 text-[11px] font-bold text-[#6A4BD0] transition hover:bg-[#F7F3FF]"
                    aria-label={`Cuộn tới vị trí lỗi ${i + 1} trong bài viết`}
                  >
                    Xem trong bài ↑
                  </button>
                )}
              </div>

              {useful ? (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
                    <span className="pt-px text-[11px] font-bold uppercase tracking-wide text-[#9D96AE]">Trong bài</span>
                    <BeforeLine quote={h.quote} fix={fix} />
                  </div>
                  <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
                    <span className="pt-px text-[11px] font-bold uppercase tracking-wide text-emerald-700">Sửa thành</span>
                    <AfterLine quote={h.quote} fix={fix} />
                  </div>
                  <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
                    <span className="pt-px text-[11px] font-bold uppercase tracking-wide text-[#9D96AE]">Vì sao</span>
                    <span className="leading-relaxed text-[#655E75]">{reason}</span>
                  </div>
                </div>
              ) : (
                // FB-08: lỗi KHÔNG có bản viết lại trực tiếp (fix rỗng — thường là lỗi Task Response/
                //   nội dung lạc đề: cả câu sai so với ĐỀ, không có "sửa tối thiểu" để diff) hoặc bài
                //   chấm cũ thiếu fix → vẫn dùng CÙNG layout 3 dòng cho đồng bộ với card có diff:
                //   Trong bài / Gợi ý (thay vì "Sửa thành") / Vì sao.
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
                    <span className="pt-px text-[11px] font-bold uppercase tracking-wide text-[#9D96AE]">Trong bài</span>
                    <span className="italic leading-relaxed text-slate-600">“{h.quote}”</span>
                  </div>
                  <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
                    <span className="pt-px text-[11px] font-bold uppercase tracking-wide text-emerald-700">Gợi ý</span>
                    <span className="leading-relaxed text-slate-700">{h.suggestion}</span>
                  </div>
                  {h.reason_vi?.trim() && (
                    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
                      <span className="pt-px text-[11px] font-bold uppercase tracking-wide text-[#9D96AE]">Vì sao</span>
                      <span className="leading-relaxed text-[#655E75]">{h.reason_vi}</span>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
