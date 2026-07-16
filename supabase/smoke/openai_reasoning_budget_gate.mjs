// AI-003 gate — tripwire chống revert: nhánh OpenAI của writing-grader PHẢI cấp budget riêng cho
//   reasoning + kiểm truncation. Bug gốc: MAX_TOKENS=4000 dùng chung cho Anthropic max_tokens VÀ OpenAI
//   max_output_tokens; gpt-5.6-* là reasoning model → reasoning token tính vào max_output_tokens → 4000
//   bị nuốt sạch → status:'incomplete', không output_text → chấm Writing LUÔN hỏng (fail-closed nhưng
//   không dùng được), và code cũ KHÔNG kiểm status nên Owner không thấy nguyên nhân.
//   Gate đọc SOURCE (bất biến cấu trúc) + import module thuần (giá trị).
//     node supabase/smoke/openai_reasoning_budget_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const grader = readFileSync(resolve(root, 'lib/ai/writing-grader.ts'), 'utf8')
const helper = readFileSync(resolve(root, 'lib/ai/openai-responses.ts'), 'utf8')
const registry = readFileSync(resolve(root, 'lib/env.ts'), 'utf8')
const example = readFileSync(resolve(root, '.env.example'), 'utf8')
const mod = await import('../../lib/ai/openai-responses.ts')

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

// Cắt riêng thân gradeWithOpenAi để bất biến không bị nhánh Anthropic làm nhiễu.
const oaStart = grader.indexOf('async function gradeWithOpenAi')
const oaEnd = grader.indexOf('export async function gradeWriting')
const openaiBody = oaStart > 0 && oaEnd > oaStart ? grader.slice(oaStart, oaEnd) : ''

console.log('AI-003 — budget OpenAI TÁCH KHỎI hằng Anthropic:')
check('tìm được thân gradeWithOpenAi', openaiBody.length > 0)
// Bất biến số 1 — chính là bug: OpenAI KHÔNG được dùng chung MAX_TOKENS của Anthropic.
check('max_output_tokens KHÔNG dùng hằng MAX_TOKENS (dùng chung với Anthropic)',
  !/max_output_tokens:\s*MAX_TOKENS/.test(openaiBody), 'vẫn dùng chung → reasoning nuốt hết budget')
check('max_output_tokens lấy từ openaiMaxOutputTokens()',
  /max_output_tokens:\s*openaiMaxOutputTokens\(\)/.test(openaiBody))
check('Anthropic vẫn giữ max_tokens: MAX_TOKENS (không đụng nhánh đang chạy)',
  /max_tokens:\s*MAX_TOKENS/.test(grader.slice(0, oaStart)))

console.log('\nAI-003 — reasoning.effort tường minh (nút vặn chi phí):')
check('body có tham số reasoning', /reasoning:\s*\{/.test(openaiBody))
check('effort lấy từ openaiReasoningEffort() (không hardcode)',
  /openaiReasoningEffort\(\)/.test(openaiBody))
check('effort invalid → fail-loud trước khi gọi provider (AI-002)',
  /effortSel\.ok\s*!==\s*true|!effortSel\.ok/.test(openaiBody), 'phải chặn trước fetch')

console.log('\nAI-003 — truncation quan sát được:')
check('dùng parseOpenAiResponse() (không tự bóc output rời rạc)',
  /parseOpenAiResponse\(/.test(openaiBody))
// Chỉ soi ĐÚNG các lời gọi logEvent (cắt chuỗi thô sẽ bắt nhầm `apiKey` ở header authorization).
const logCalls = openaiBody.match(/logEvent\((?:[^()]|\([^()]*\))*\)/g) ?? []
check('có lời gọi logEvent trong nhánh OpenAI', logCalls.length > 0, `n=${logCalls.length}`)
check('có logEvent kèm reason (Owner debug được vì sao hỏng)',
  logCalls.some((c) => /scoring\.provider_error/.test(c) && /reason/.test(c)))
check('KHÔNG logEvent nào mang bài thi/secret/nội dung thô',
  logCalls.every((c) => !/task1_text|task2_text|apiKey|outputText|userContent|input\b/.test(c)),
  logCalls.filter((c) => /task1_text|task2_text|apiKey|outputText|userContent|input\b/.test(c)).join(' | '))

console.log('\nAI-003 — module thuần test được (Node type-strip):')
check("openai-responses.ts KHÔNG import 'server-only'", !/import 'server-only'/.test(helper))
check('openai-responses.ts KHÔNG có import runtime', !/^\s*import\s/m.test(helper))
check('mặc định budget ≥ 25.000 (khuyến nghị OpenAI cho reasoning)',
  mod.openaiMaxOutputTokens({}) >= 25000, `got=${mod.openaiMaxOutputTokens({})}`)
check('4000 (giá trị bug cũ) KHÔNG bao giờ được dùng',
  mod.openaiMaxOutputTokens({ WRITING_GRADER_OPENAI_MAX_OUTPUT_TOKENS: '4000' }) >= 25000)

console.log('\nAI-003 — hợp đồng ENV (DEPLOY-004, không drift):')
for (const v of ['WRITING_GRADER_OPENAI_MAX_OUTPUT_TOKENS', 'WRITING_GRADER_OPENAI_REASONING_EFFORT']) {
  check(`${v} khai trong ENV_REGISTRY`, registry.includes(v))
  check(`${v} có trong .env.example`, new RegExp(`(^|\\n)\\s*#?\\s*${v}=`).test(example))
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
