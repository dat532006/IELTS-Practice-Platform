// AI-005 gate — Version A (corrected_version) + bảng vocab (vocabulary_upgrades) phải đi HẾT đường:
//   Zod schema → schema 2 provider → type DTO → UI render. Thiếu 1 mắt xích là field bị rơi âm thầm
//   (AI trả nhưng Zod .strict() reject → AI_INVALID_OUTPUT → chấm hỏng; hoặc parse xong nhưng UI không
//   hiện → Owner tưởng AI không làm).
// BẤT BIẾN GIỮ NGUYÊN: overall_band vẫn SERVER-compute — AI KHÔNG được trả overall (LUẬT THÉP W10).
//   node supabase/smoke/writing_rich_feedback_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
// Bóc comment TRƯỚC khi kiểm bất biến: comment mô tả field ("+ vocabulary_upgrades — cả hai optional")
//   làm regex xanh giả kể cả khi code render đã bị xoá sạch. Đã dính đúng bẫy này 2 lần (obs_event_gate
//   với 'server-only', và MUT4 của chính gate này) → kiểm trên source ĐÃ BÓC comment.
// THỨ TỰ: line-comment TRƯỚC block — line comment chứa '/*' (vd "/api/admin/*") sẽ mở block giả
// nuốt cả đoạn code tới '*/' gần nhất (bug thật đã gặp ở writing_authoring_gate trên AdminTestForm).
const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
const schema = read('lib/ai/grade-schema.ts')
const grader = read('lib/ai/writing-grader.ts')
const rubric = read('lib/ai/ielts-writing-rubric.ts')
const types = read('types/exam.ts')
const ui = read('components/writing/WritingResultView.tsx')

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('AI-005 — module schema THUẦN (test Node trực tiếp được):')
check("grade-schema.ts KHÔNG import 'server-only'", !/import 'server-only'/.test(schema))
check('grade-schema.ts KHÔNG dùng alias @/ (Node không resolve được)', !/from '@\//.test(schema))
check('writing-grader import schema từ module chung (không định nghĩa lại)',
  /from '@\/lib\/ai\/grade-schema'/.test(grader) && !/const AiGradeSchema = z\.object/.test(grader))

console.log('\nAI-005 — Zod nhận 2 field mới:')
for (const f of ['corrected_version', 'vocabulary_upgrades']) {
  check(`Zod TaskGrade có ${f}`, new RegExp(`${f}:\\s*z\\.`).test(schema))
}
check('VocabUpgrade có đủ 5 cột (word/level/meaning_vi/why/example)',
  ['word', 'level', 'meaning_vi', 'why', 'example'].every((k) => new RegExp(`${k}:\\s*z\\.`).test(schema)))
check('level là enum B2/C1/C2 (không phải string tự do)', /level:\s*z\.enum\(\['B2', 'C1', 'C2'\]\)/.test(schema))

console.log('\nAI-005 — schema 2 provider không drift:')
// OpenAI strict: MỌI property phải nằm trong required, nếu không API 400.
const oaStart = schema.indexOf('OPENAI_TASK_JSON')
const oaBody = schema.slice(oaStart, schema.indexOf('OPENAI_GRADE_SCHEMA'))
check('OpenAI schema có properties corrected_version + vocabulary_upgrades',
  /corrected_version/.test(oaBody) && /vocabulary_upgrades/.test(oaBody))
check('OpenAI strict: 2 field mới NẰM TRONG required (thiếu → API 400)',
  /required:\s*\[[^\]]*'corrected_version'[^\]]*'vocabulary_upgrades'[^\]]*\]/.test(oaBody), 'strict mode đòi mọi field required')
const anStart = schema.indexOf('const TASK_JSON')
const anBody = schema.slice(anStart, oaStart)
check('Anthropic schema (đường lui) cũng có 2 field mới',
  /corrected_version/.test(anBody) && /vocabulary_upgrades/.test(anBody))

console.log('\nAI-005 — budget đủ cho output dài hơn:')
const mt = Number((grader.match(/const MAX_TOKENS = ([\d_]+)/) ?? [])[1]?.replace(/_/g, ''))
// Version A (2 bài viết lại) + 2 bảng vocab → 4000 (giá trị cũ) chắc chắn bị cắt giữa chừng.
check('MAX_TOKENS (Anthropic) đã nâng khỏi 4000', Number.isFinite(mt) && mt > 4000, `MAX_TOKENS=${mt}`)

console.log('\nAI-005 — rubric có chỉ thị sinh 2 field:')
check('rubric nhắc corrected_version', /corrected_version/.test(rubric))
check('rubric nhắc vocabulary_upgrades', /vocabulary_upgrades/.test(rubric))
check('rubric yêu cầu Version A GIỮ trình độ/ý gốc (không nâng quá đà)',
  /do not upgrade|không nâng|keep .*close|preserve/i.test(rubric))

console.log('\nAI-005 — LUẬT THÉP W10 giữ nguyên (AI KHÔNG trả overall):')
check('rubric vẫn CẤM AI tính overall band', /Do NOT compute or output any combined overall band/.test(rubric))
// Kiểm CẤU TRÚC, không regex source: /overall/i sẽ khớp vào chính comment giải thích "không có overall"
//   (đúng loại false-positive từng gặp ở obs_event_gate với 'server-only').
const { AiGradeSchema, OPENAI_GRADE_SCHEMA, GRADE_INPUT_SCHEMA } = await import('../../lib/ai/grade-schema.ts')
const crit = { task_response: 6, coherence_cohesion: 6, lexical_resource: 6, grammar: 6 }
const bare = { band: 6, criteria: crit, feedback: 'x', suggestions: [] }
check('Zod .strict() CHẶN overall_band do AI nhét vào',
  !AiGradeSchema.safeParse({ task1: bare, task2: bare, overall_band: 7 }).success)
check('schema OpenAI không khai overall', !Object.keys(OPENAI_GRADE_SCHEMA.properties.task1.properties).some((k) => /overall/i.test(k)))
check('schema Anthropic không khai overall', !Object.keys(GRADE_INPUT_SCHEMA.properties.task1.properties).some((k) => /overall/i.test(k)))
check('server vẫn tự tính overall', /computeOverallBand\(/.test(read('lib/exam/writing.ts')))
check('UI không nhận overall từ AI (chỉ result.overall_band server)', !/task1\.overall|grade\.overall/.test(ui))

console.log('\nAI-005 — DTO + UI hiển thị (không rơi âm thầm):')
check('types/exam.ts WritingTaskGrade có corrected_version', /corrected_version\?:/.test(stripComments(types)))
check('types/exam.ts WritingTaskGrade có vocabulary_upgrades', /vocabulary_upgrades\?:/.test(stripComments(types)))
// Bắt ĐÚNG biểu thức JSX đọc field, trên source đã bóc comment → xoá render là đỏ ngay.
const uiCode = stripComments(ui)
check('UI thực sự render corrected_version (JSX đọc grade.corrected_version)',
  /\{grade\.corrected_version[\s&.]/.test(uiCode) && /grade\.corrected_version\}/.test(uiCode))
check('UI thực sự render vocabulary_upgrades (truyền vào VocabTable)',
  /items=\{grade\.vocabulary_upgrades\}/.test(uiCode))
check('UI render có điều kiện (bài chấm cũ thiếu field → không vỡ)',
  /grade\.corrected_version &&/.test(uiCode) && /grade\.vocabulary_upgrades &&/.test(uiCode))
check('UI vẫn hiển thị overall_band server (không thay bằng số AI)', /result\.overall_band/.test(uiCode))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
