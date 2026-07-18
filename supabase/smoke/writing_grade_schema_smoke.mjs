// AI-005 smoke — hợp đồng Zod cho grade Writing (lib/ai/grade-schema.ts), import module PRODUCTION.
//   AiGradeSchema là .strict(): field AI trả mà schema không khai → REJECT → AI_INVALID_OUTPUT → chấm
//   hỏng. Nên mọi field mới phải được test thật, không chỉ đọc source.
//     node supabase/smoke/writing_grade_schema_smoke.mjs
import { AiGradeSchema, OPENAI_GRADE_SCHEMA, GRADE_INPUT_SCHEMA } from '../../lib/ai/grade-schema.ts'

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

const crit = { task_response: 6, coherence_cohesion: 6, lexical_resource: 6, grammar: 6 }
const vocab = { word: 'a marked increase', level: 'C1', meaning_vi: 'sự tăng rõ rệt', why: 'thay cho "big increase" lặp lại', example: 'The chart shows a marked increase in sales.' }
const improve = { criterion: 'task_response', kind: 'fix', priority: 1, title_vi: 'Thêm câu overview', detail_vi: 'Bổ sung overview nêu xu hướng chính ngay sau mở bài.', example: 'Overall, sales rose steadily.' }
const task = (over = {}) => ({
  band: 6, criteria: crit, feedback: 'Bài ở band 6 vì...', suggestions: ['Thêm overview.'],
  error_highlights: [{ quote: 'is increase', type: 'grammar', suggestion: 'increases', fix: 'increases', reason_vi: 'Chủ ngữ số ít cần động từ chia ngôi.' }],
  corrected_version: 'The chart shows a marked increase in sales.',
  vocabulary_upgrades: [vocab], improvement_plan: [improve], ...over,
})
const grade = (t1 = {}, t2 = {}) => ({ task1: task(t1), task2: task(t2) })

console.log('AI-005 — Zod nhận field mới (nếu reject → chấm hỏng hoàn toàn):')
{
  const r = AiGradeSchema.safeParse(grade())
  check('grade đầy đủ + corrected_version + vocab → PASS', r.success, JSON.stringify(r.error?.issues?.[0]))
  check('giữ nguyên corrected_version', r.success && r.data.task1.corrected_version.startsWith('The chart'))
  check('giữ nguyên vocab 5 cột', r.success && r.data.task1.vocabulary_upgrades[0].level === 'C1')
}

console.log('\nAI-005 — tương thích ngược (Anthropic/bài cũ có thể thiếu field):')
{
  const bare = { band: 6, criteria: crit, feedback: 'x', suggestions: [] }
  check('thiếu CẢ 2 field mới → vẫn PASS (optional)', AiGradeSchema.safeParse({ task1: bare, task2: bare }).success)
  check('chỉ có corrected_version → PASS', AiGradeSchema.safeParse({ task1: { ...bare, corrected_version: 'x' }, task2: bare }).success)
  check('vocab rỗng [] → PASS (không có từ nào đáng nâng)', AiGradeSchema.safeParse({ task1: { ...bare, vocabulary_upgrades: [] }, task2: bare }).success)
}

console.log('\nFB-01/FB-02 — highlight fix/reason_vi + improvement_plan:')
{
  const r = AiGradeSchema.safeParse(grade())
  check('highlight có fix + reason_vi → PASS', r.success, JSON.stringify(r.error?.issues?.[0]))
  check('giữ nguyên fix', r.success && r.data.task1.error_highlights[0].fix === 'increases')
  check('improvement_plan đầy đủ → PASS + giữ title_vi', r.success && r.data.task1.improvement_plan[0].title_vi === 'Thêm câu overview')
  const bare = { band: 6, criteria: crit, feedback: 'x', suggestions: [] }
  check('highlight KHÔNG fix/reason_vi (bài cũ) → vẫn PASS',
    AiGradeSchema.safeParse({ task1: { ...bare, error_highlights: [{ quote: 'q', type: 'grammar', suggestion: 's' }] }, task2: bare }).success)
  check('fix rỗng "" (OpenAI strict không-áp-dụng) → PASS',
    AiGradeSchema.safeParse(grade({ error_highlights: [{ quote: 'q', type: 'grammar', suggestion: 's', fix: '', reason_vi: '' }] })).success)
  check('improvement_plan rỗng [] → PASS', AiGradeSchema.safeParse(grade({ improvement_plan: [] })).success)
  check('improvement_plan kind lạ → REJECT',
    !AiGradeSchema.safeParse(grade({ improvement_plan: [{ ...improve, kind: 'maybe' }] })).success)
  check('priority ngoài 1..3 → REJECT',
    !AiGradeSchema.safeParse(grade({ improvement_plan: [{ ...improve, priority: 4 }] })).success)
  check('priority không nguyên → REJECT',
    !AiGradeSchema.safeParse(grade({ improvement_plan: [{ ...improve, priority: 1.5 }] })).success)
  check('criterion lạ → REJECT',
    !AiGradeSchema.safeParse(grade({ improvement_plan: [{ ...improve, criterion: 'spelling' }] })).success)
  check('improvement_plan thiếu title_vi → REJECT',
    !AiGradeSchema.safeParse(grade({ improvement_plan: [{ criterion: 'grammar', kind: 'fix', priority: 1, detail_vi: 'x' }] })).success)
  check('improvement_plan quá 8 item → REJECT',
    !AiGradeSchema.safeParse(grade({ improvement_plan: Array(9).fill(improve) })).success)
  check('field lạ trong improvement item → REJECT (.strict)',
    !AiGradeSchema.safeParse(grade({ improvement_plan: [{ ...improve, band_gain: 0.5 }] })).success)
}

console.log('\nAI-005 — chặn rác từ AI:')
{
  check('level ngoài B2/C1/C2 → REJECT',
    !AiGradeSchema.safeParse(grade({ vocabulary_upgrades: [{ ...vocab, level: 'A1' }] })).success)
  check('vocab thiếu meaning_vi → REJECT',
    !AiGradeSchema.safeParse(grade({ vocabulary_upgrades: [{ word: 'x', level: 'C1', why: 'y', example: 'z' }] })).success)
  check('corrected_version quá dài → REJECT (chống nuốt token/DB)',
    !AiGradeSchema.safeParse(grade({ corrected_version: 'x'.repeat(8001) })).success)
  check('vocab quá nhiều (>10) → REJECT',
    !AiGradeSchema.safeParse(grade({ vocabulary_upgrades: Array(11).fill(vocab) })).success)
  check('corrected_version không phải string → REJECT',
    !AiGradeSchema.safeParse(grade({ corrected_version: 123 })).success)
  // LUẬT THÉP W10: AI KHÔNG được trả overall — .strict() phải chặn kể cả khi model cố nhét vào.
  check('AI cố trả overall_band → REJECT (.strict, server là source of truth)',
    !AiGradeSchema.safeParse({ ...grade(), overall_band: 7 }).success)
  check('AI nhét overall vào task → REJECT',
    !AiGradeSchema.safeParse(grade({ overall_band: 7 })).success)
}

console.log('\nAI-005 — schema OpenAI strict (mọi property phải required, nếu không API 400):')
{
  const t = OPENAI_GRADE_SCHEMA.properties.task1
  const props = Object.keys(t.properties)
  check('có corrected_version + vocabulary_upgrades', props.includes('corrected_version') && props.includes('vocabulary_upgrades'))
  check('có improvement_plan (FB-02)', props.includes('improvement_plan'))
  check('MỌI property đều nằm trong required (yêu cầu strict mode)',
    props.every((p) => t.required.includes(p)), `thiếu: ${props.filter((p) => !t.required.includes(p)).join(', ')}`)
  check('additionalProperties:false ở mọi tầng', t.additionalProperties === false && OPENAI_GRADE_SCHEMA.additionalProperties === false)
  const v = t.properties.vocabulary_upgrades.items
  check('vocab item: mọi property required', Object.keys(v.properties).every((p) => v.required.includes(p)))
  check('vocab level enum khớp Zod', JSON.stringify(v.properties.level.enum) === JSON.stringify(['B2', 'C1', 'C2']))
  const eh = t.properties.error_highlights.items
  check('error_highlight item: fix + reason_vi required (strict — "" = không áp dụng)',
    ['fix', 'reason_vi'].every((p) => p in eh.properties && eh.required.includes(p)))
  const ip = t.properties.improvement_plan.items
  check('improvement item: mọi property required', Object.keys(ip.properties).every((p) => ip.required.includes(p)))
  check('improvement kind enum fix/keep', JSON.stringify(ip.properties.kind.enum) === JSON.stringify(['fix', 'keep']))
  check('OpenAI schema KHÔNG có overall (AI không trả được)', !JSON.stringify(OPENAI_GRADE_SCHEMA).includes('overall'))
}

console.log('\nAI-005 — schema Anthropic (đường lui) — field mới KHÔNG bắt buộc:')
{
  const t = GRADE_INPUT_SCHEMA.properties.task1
  check('có corrected_version + vocabulary_upgrades trong properties',
    'corrected_version' in t.properties && 'vocabulary_upgrades' in t.properties)
  check('có improvement_plan + highlight fix/reason_vi trong properties (FB-01/02)',
    'improvement_plan' in t.properties && 'fix' in t.properties.error_highlights.items.properties
      && 'reason_vi' in t.properties.error_highlights.items.properties)
  check('KHÔNG ép required (Anthropic được phép bỏ qua)',
    !t.required.includes('corrected_version') && !t.required.includes('vocabulary_upgrades') && !t.required.includes('improvement_plan'))
  check('highlight fix/reason_vi cũng KHÔNG required (Anthropic bỏ qua được)',
    !t.properties.error_highlights.items.required.includes('fix') && !t.properties.error_highlights.items.required.includes('reason_vi'))
  check('Anthropic schema KHÔNG có overall', !JSON.stringify(GRADE_INPUT_SCHEMA).includes('overall'))
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
