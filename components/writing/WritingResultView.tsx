import type { WritingGradeResult, WritingImprovementItem, WritingTaskGrade, WritingVocabUpgrade } from '@/types/exam'
import { WritingErrorHighlights } from '@/components/writing/WritingErrorHighlights'
import { WritingFeedback } from '@/components/writing/WritingFeedback'

// Presentational result panel dùng chung cho WritingRunner + /writing-result/[id].
// overall_band là giá trị SERVER; UI chỉ trình bày, tuyệt đối không tính lại hay tin số tổng từ AI.
type CriterionKey = keyof WritingTaskGrade['criteria']

const CRITERIA: Array<{ key: CriterionKey; label: string; index: string; accent: string; soft: string }> = [
  { key: 'task_response', label: 'Task Response / Achievement', index: '01', accent: '#7C5CE6', soft: '#F2EEFF' },
  { key: 'coherence_cohesion', label: 'Coherence & Cohesion', index: '02', accent: '#3B82F6', soft: '#EEF6FF' },
  { key: 'lexical_resource', label: 'Lexical Resource', index: '03', accent: '#D97706', soft: '#FFF6E5' },
  { key: 'grammar', label: 'Grammatical Range & Accuracy', index: '04', accent: '#F26B4D', soft: '#FFF0EB' },
]

const LEVEL_STYLE: Record<WritingVocabUpgrade['level'], string> = {
  B2: 'bg-sky-100 text-sky-800',
  C1: 'bg-violet-100 text-violet-800',
  C2: 'bg-rose-100 text-rose-800',
}

// FB-02 — "Lộ trình cải thiện" cấu trúc: chip tiêu chí đúng màu accent của 4 card điểm, title đậm
//   làm anchor đọc lướt, sắp theo priority (1 = tác động band lớn nhất), điểm mạnh tách khối riêng.
const IMPROVE_CRIT: Record<WritingImprovementItem['criterion'], { label: string; accent: string; soft: string }> = {
  task_response: { label: 'Task Response', accent: '#7C5CE6', soft: '#F2EEFF' },
  coherence_cohesion: { label: 'Coherence & Cohesion', accent: '#3B82F6', soft: '#EEF6FF' },
  lexical_resource: { label: 'Lexical Resource', accent: '#D97706', soft: '#FFF6E5' },
  grammar: { label: 'Grammar', accent: '#F26B4D', soft: '#FFF0EB' },
  general: { label: 'Tổng thể', accent: '#6A4BD0', soft: '#F6F3FF' },
}
const PRIORITY_BADGE: Record<1 | 2 | 3, { label: string; cls: string }> = {
  1: { label: 'Ưu tiên cao', cls: 'bg-[#FDE8E4] text-[#C2402F]' },
  2: { label: 'Nên làm', cls: 'bg-[#FFF6E5] text-[#B45309]' },
  3: { label: 'Hoàn thiện', cls: 'bg-[#F1EDF6] text-[#6A6480]' },
}

function ImprovementPlan({ items, band }: { items: WritingImprovementItem[]; band: number }) {
  const fixes = [...items.filter((it) => it.kind === 'fix')].sort((a, b) => a.priority - b.priority)
  const keeps = items.filter((it) => it.kind === 'keep')
  const nextBand = Math.min(9, band + 0.5)
  return (
    <div className="rounded-[20px] border border-[#E7DFFF] bg-[#FAF8FF] p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#EDE6FF] text-sm font-black text-[#6A4BD0]">↗</span>
        <div>
          <h4 className="text-sm font-extrabold text-[#2A2740]">
            Lộ trình cải thiện — hướng tới band {nextBand.toFixed(1)}
          </h4>
          <p className="text-[11px] font-semibold text-[#9D96AE]">Sắp xếp theo mức tác động tới band, việc quan trọng nhất lên đầu</p>
        </div>
      </div>

      <ol className="mt-4 space-y-2.5">
        {fixes.map((it, index) => {
          const crit = IMPROVE_CRIT[it.criterion] ?? IMPROVE_CRIT.general
          const prio = PRIORITY_BADGE[it.priority] ?? PRIORITY_BADGE[3]
          return (
            <li
              key={index}
              className="rounded-[14px] border border-[#EDE8F5] bg-white p-3.5 shadow-[0_10px_24px_-22px_rgba(42,39,64,0.55)]"
              style={{ borderLeft: `4px solid ${crit.accent}` }}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[#F0ECFF] text-[10px] font-extrabold text-[#6A4BD0]">
                  {index + 1}
                </span>
                <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ backgroundColor: crit.soft, color: crit.accent }}>
                  {crit.label}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${prio.cls}`}>{prio.label}</span>
              </div>
              <p className="mt-2 text-[13.5px] font-extrabold leading-snug text-[#2A2740]">{it.title_vi}</p>
              <p className="mt-1 text-[13px] leading-[1.65] text-[#514B63]">{it.detail_vi}</p>
              {it.example?.trim() && (
                <p className="mt-2 rounded-[10px] border-l-2 border-[#CBBFF0] bg-[#F8F6FE] px-3 py-2 text-[12.5px] italic leading-relaxed text-[#5F46BD]">
                  {it.example}
                </p>
              )}
            </li>
          )
        })}
      </ol>

      {keeps.length > 0 && (
        <div className="mt-3 rounded-[14px] border border-[#D8EEDF] bg-[#F4FBF6] p-3.5">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#1E7A43]">Điểm mạnh cần duy trì</p>
          <ul className="mt-2 space-y-2">
            {keeps.map((it, index) => (
              <li key={index} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2 text-[13px] leading-[1.6] text-[#3D5A48]">
                <span className="pt-px font-black text-[#1E9E56]" aria-hidden>✓</span>
                <span>
                  <span className="font-extrabold text-[#255C3C]">{it.title_vi}</span>
                  {it.detail_vi && <span className="text-[#3D5A48]"> — {it.detail_vi}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function VocabTable({ items }: { items: WritingVocabUpgrade[] }) {
  return (
    <div className="rounded-[20px] border border-[#E9E3F1] bg-white p-4 sm:p-5">
      <h4 className="text-sm font-extrabold text-[#2A2740]">Từ vựng nên học</h4>
      <p className="mt-1 text-[11px] font-semibold text-[#9D96AE]">Các từ và cụm từ phù hợp để nâng chất lượng bài viết.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr className="text-[#8B849B]">
              <th className="border-b border-[#EAE5F0] pb-2.5 pr-3 font-bold">Từ / cụm</th>
              <th className="border-b border-[#EAE5F0] pb-2.5 pr-3 font-bold">Level</th>
              <th className="border-b border-[#EAE5F0] pb-2.5 pr-3 font-bold">Nghĩa</th>
              <th className="border-b border-[#EAE5F0] pb-2.5 pr-3 font-bold">Vì sao hợp bài này</th>
              <th className="border-b border-[#EAE5F0] pb-2.5 font-bold">Ví dụ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((v, i) => (
              <tr key={i} className="align-top text-[#655E75]">
                <td className="border-b border-[#F1EDF5] py-3 pr-3 font-extrabold text-[#2A2740]">{v.word}</td>
                <td className="border-b border-[#F1EDF5] py-3 pr-3">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold ${LEVEL_STYLE[v.level]}`}>{v.level}</span>
                </td>
                <td className="border-b border-[#F1EDF5] py-3 pr-3 leading-relaxed">{v.meaning_vi}</td>
                <td className="border-b border-[#F1EDF5] py-3 pr-3 leading-relaxed">{v.why}</td>
                <td className="border-b border-[#F1EDF5] py-3 italic leading-relaxed">{v.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CriterionCard({ item, value }: { item: (typeof CRITERIA)[number]; value: number }) {
  const progress = `${(Math.max(0, Math.min(9, value)) / 9) * 100}%`
  return (
    <div className="rounded-[18px] border border-[#ECE7F3] bg-white p-4 shadow-[0_12px_30px_-26px_rgba(42,39,64,0.7)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="grid h-8 w-8 flex-none place-items-center rounded-[10px] text-[11px] font-extrabold"
            style={{ backgroundColor: item.soft, color: item.accent }}
          >
            {item.index}
          </span>
          <span className="pt-0.5 text-[12.5px] font-extrabold leading-[1.35] text-[#514B63]">{item.label}</span>
        </div>
        <span className="flex-none text-xl font-black tracking-[-0.03em]" style={{ color: item.accent }}>
          {value.toFixed(1)}
        </span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#F1EDF6]" aria-hidden>
        <div className="h-full rounded-full" style={{ width: progress, backgroundColor: item.accent }} />
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-bold text-[#AAA3B8]">
        <span>0</span>
        <span>IELTS Band</span>
        <span>9</span>
      </div>
    </div>
  )
}

function TaskResult({ n, grade, essay }: { n: number; grade: WritingTaskGrade; essay?: string }) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-[#E9E3F1] bg-white shadow-[0_22px_54px_-40px_rgba(42,39,64,0.7)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ECE7F3] bg-[linear-gradient(110deg,#F7F3FF_0%,#FFFFFF_54%,#FFF3ED_100%)] px-5 py-5 sm:px-7">
        <div>
          <span className="inline-flex rounded-full bg-[#EDE6FF] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#6A4BD0]">
            IELTS Writing
          </span>
          <h3 className="mt-2 text-xl font-black tracking-[-0.02em] text-[#2A2740]">Kết quả Task {n}</h3>
          <p className="mt-1 text-xs font-semibold text-[#8B849B]">Phân tích theo 4 tiêu chí band descriptor</p>
        </div>
        <div className="flex items-center gap-3 rounded-[18px] border border-white/80 bg-white/85 px-4 py-3 shadow-[0_12px_30px_-22px_rgba(42,39,64,0.8)]">
          <span className="text-right text-[11px] font-bold uppercase leading-tight tracking-[0.08em] text-[#9D96AE]">
            Task
            <br />
            Band
          </span>
          <span className="text-3xl font-black tracking-[-0.04em] text-[#6A4BD0]">{grade.band.toFixed(1)}</span>
        </div>
      </div>

      <div className="space-y-7 p-5 sm:p-7">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-extrabold text-[#2A2740]">Điểm theo 4 tiêu chí</h4>
            <span className="text-[11px] font-semibold text-[#9D96AE]">Thang điểm 0–9</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {CRITERIA.map((item) => (
              <CriterionCard key={item.key} item={item} value={Number(grade.criteria[item.key])} />
            ))}
          </div>
        </div>

        {grade.feedback && (
          <div>
            <div className="mb-3">
              <h4 className="text-sm font-extrabold text-[#2A2740]">Nhận xét chi tiết</h4>
              <p className="mt-1 text-xs font-medium text-[#9D96AE]">Các ý đã được nhóm theo tiêu chí để bạn dễ đọc và đối chiếu.</p>
            </div>
            <WritingFeedback feedback={grade.feedback} />
          </div>
        )}

        {/* FB-02: lộ trình cấu trúc (title đậm + chip tiêu chí + priority); bài chấm cũ chỉ có
            suggestions text tự do → fallback layout cũ. */}
        {grade.improvement_plan && grade.improvement_plan.length > 0 ? (
          <ImprovementPlan items={grade.improvement_plan} band={grade.band} />
        ) : (
          grade.suggestions?.length > 0 && (
            <div className="rounded-[20px] border border-[#E7DFFF] bg-[#FAF8FF] p-4 sm:p-5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#EDE6FF] text-sm font-black text-[#6A4BD0]">↗</span>
                <div>
                  <h4 className="text-sm font-extrabold text-[#2A2740]">Lộ trình cải thiện</h4>
                  <p className="text-[11px] font-semibold text-[#9D96AE]">Các bước ưu tiên để nâng band</p>
                </div>
              </div>
              <ol className="mt-4 grid gap-2.5 md:grid-cols-2">
                {grade.suggestions.map((suggestion, index) => (
                  <li key={index} className="flex gap-3 rounded-[14px] border border-[#EDE8F5] bg-white p-3.5 text-[13px] leading-[1.6] text-[#514B63]">
                    <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[#F0ECFF] text-[10px] font-extrabold text-[#6A4BD0]">
                      {index + 1}
                    </span>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ol>
            </div>
          )
        )}

        {grade.error_highlights && grade.error_highlights.length > 0 && (
          <WritingErrorHighlights highlights={grade.error_highlights} essay={essay} />
        )}

        {grade.corrected_version && grade.corrected_version.trim().length > 0 && (
          <details className="rounded-[18px] border border-[#E9E3F1] bg-[#FAF9FC] p-4 sm:p-5">
            <summary className="cursor-pointer text-sm font-extrabold text-[#2A2740]">Bản sửa lại (Version A)</summary>
            <p className="mt-1.5 text-[11px] font-medium text-[#8B849B]">
              Giữ nguyên ý và trình độ bài gốc, chỉ sửa lỗi để tự nhiên hơn — không phải bài mẫu band 9.
            </p>
            <p className="mt-4 whitespace-pre-line rounded-[14px] bg-white p-4 text-sm leading-[1.75] text-[#514B63]">
              {grade.corrected_version}
            </p>
          </details>
        )}

        {grade.vocabulary_upgrades && grade.vocabulary_upgrades.length > 0 && <VocabTable items={grade.vocabulary_upgrades} />}
      </div>
    </section>
  )
}

export function WritingResultView({
  result,
  essays,
}: {
  result: WritingGradeResult
  essays?: { task1: string; task2: string }
}) {
  // FB-01: WritingRunner truyền essays từ client state (ngay sau khi chấm); trang /writing-result
  //   không truyền → dùng result.essays (DTO owner-only) — trang xem lại vẫn có bài + highlight lỗi.
  const essayData = essays ?? result.essays
  return (
    <div className="text-[#2A2740]">
      <section className="relative mb-6 overflow-hidden rounded-[26px] border border-[#E8E0F4] bg-[linear-gradient(118deg,#F2ECFF_0%,#FFFFFF_52%,#FFF0E9_100%)] p-6 shadow-[0_24px_60px_-42px_rgba(64,45,105,0.75)] sm:p-8">
        <span className="pointer-events-none absolute -right-14 -top-20 h-52 w-52 rounded-full bg-[#E8DEFF]/70 blur-2xl" />
        <span className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-[#FFE2D7]/60 blur-2xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#6A4BD0] shadow-sm">
              <span aria-hidden>✦</span> AI Writing Assessment
            </span>
            <h2 className="mt-4 text-2xl font-black tracking-[-0.035em] text-[#2A2740] sm:text-3xl">Kết quả bài viết của bạn</h2>
            <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-[#746D85]">
              Điểm tổng hợp từ Task 1 và Task 2, kèm nhận xét theo từng tiêu chí IELTS Writing.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-[#E5DDF2] bg-white/75 px-3 py-1.5 text-xs font-bold text-[#655E75]">
                Task 1 · {result.task1.band.toFixed(1)}
              </span>
              <span className="rounded-full border border-[#E5DDF2] bg-white/75 px-3 py-1.5 text-xs font-bold text-[#655E75]">
                Task 2 · {result.task2.band.toFixed(1)}
              </span>
              <span className="rounded-full border border-[#E5DDF2] bg-white/75 px-3 py-1.5 text-xs font-bold text-[#655E75]">
                {result.task1_wc + result.task2_wc} từ
              </span>
            </div>
          </div>
          <div className="flex h-36 w-36 flex-none flex-col items-center justify-center self-center rounded-full border-[10px] border-white bg-[#7C5CE6] text-white shadow-[0_20px_38px_-22px_rgba(92,63,180,0.9)]">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-white/75">Overall</span>
            <span className="mt-1 text-[42px] font-black leading-none tracking-[-0.06em]">{result.overall_band.toFixed(1)}</span>
            <span className="mt-1 text-[11px] font-bold text-white/80">IELTS Band</span>
          </div>
        </div>
        {/* Owner 2026-07-18: KHÔNG lộ công thức tính điểm — chỉ ghi lưu ý tham khảo. */}
        <p className="relative mt-5 border-t border-[#E7DFF1] pt-4 text-[11px] font-semibold text-[#8B849B]">
          Điểm AI chỉ mang tính tham khảo, có thể lệch ±0.5 band so với thi thật.
        </p>
      </section>

      {result.mock && (
        <p className="mb-5 rounded-[16px] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ AI grader chưa được cấu hình — đây là điểm <b>mô phỏng</b> để minh hoạ giao diện, không phản ánh chất lượng bài viết.
        </p>
      )}

      <div className="space-y-6">
        <TaskResult n={1} grade={result.task1} essay={essayData?.task1} />
        <TaskResult n={2} grade={result.task2} essay={essayData?.task2} />
      </div>

      <p className="mt-5 rounded-[14px] bg-[#F4F1F8] px-4 py-3 text-xs font-medium leading-relaxed text-[#7D768D]">
        Task 1: <b>{result.task1_wc} từ</b> · Task 2: <b>{result.task2_wc} từ</b>.
      </p>
    </div>
  )
}
