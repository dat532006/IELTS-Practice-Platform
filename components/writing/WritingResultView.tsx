import type { WritingGradeResult, WritingTaskGrade } from '@/types/exam'
import { WritingErrorHighlights } from '@/components/writing/WritingErrorHighlights'

// W10/W11 — presentational result panel (M07). Dùng chung cho inline (WritingRunner) + trang /writing-result/[id].
// overall_band = giá trị SERVER (DTO). KHÔNG tính lại ở client.
// W11: per-task error highlights (DTO whitelist). essay (nếu có) cho annotate inline; thiếu → list degrade.
const CRITERIA_LABELS: Record<string, string> = {
  task_response: 'Task Response / Achievement',
  coherence_cohesion: 'Coherence & Cohesion',
  lexical_resource: 'Lexical Resource',
  grammar: 'Grammatical Range & Accuracy',
}

function TaskResult({ n, grade, essay }: { n: number; grade: WritingTaskGrade; essay?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-bold text-slate-800">Task {n}</h3>
        <span className="rounded bg-slate-900 px-2.5 py-1 text-sm font-bold text-white">Band {grade.band.toFixed(1)}</span>
      </div>
      <dl className="mb-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {Object.entries(grade.criteria).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-2 text-sm">
            <dt className="text-slate-500">{CRITERIA_LABELS[k] ?? k}</dt>
            <dd className="font-semibold text-slate-700">{Number(v).toFixed(1)}</dd>
          </div>
        ))}
      </dl>
      {grade.feedback && <p className="mb-2 whitespace-pre-line text-sm text-slate-700">{grade.feedback}</p>}
      {grade.suggestions?.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          {grade.suggestions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
      {grade.error_highlights && grade.error_highlights.length > 0 && (
        <WritingErrorHighlights highlights={grade.error_highlights} essay={essay} />
      )}
    </div>
  )
}

export function WritingResultView({
  result,
  essays,
}: {
  result: WritingGradeResult
  essays?: { task1: string; task2: string }
}) {
  return (
    <div>
      <div className="mb-5 rounded-lg border border-teal-200 bg-teal-50 p-5 text-center">
        <div className="text-sm font-medium text-teal-700">Overall Band (server-computed)</div>
        <div className="text-4xl font-extrabold text-teal-800">{result.overall_band.toFixed(1)}</div>
        <div className="mt-1 text-xs text-teal-700">Overall = Task 1 × 1/3 + Task 2 × 2/3 (làm tròn 0.5)</div>
      </div>
      {result.mock && (
        <p className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ AI grader chưa được cấu hình — đây là điểm <b>mô phỏng</b> để minh hoạ giao diện, không phản ánh chất lượng bài viết.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TaskResult n={1} grade={result.task1} essay={essays?.task1} />
        <TaskResult n={2} grade={result.task2} essay={essays?.task2} />
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Điểm AI chỉ mang tính tham khảo. Task 1: {result.task1_wc} từ · Task 2: {result.task2_wc} từ.
      </p>
    </div>
  )
}
