// AI-016 smoke — ước tính chi phí lượt chấm (lib/ai/grade-cost.ts, module PRODUCTION) + dây persist.
//     node supabase/smoke/grade_cost_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { estimateGradeCostUsd } from '../../lib/ai/grade-cost.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
const writing = strip(readFileSync(resolve(root, 'lib/exam/writing.ts'), 'utf8'))
const grader = strip(readFileSync(resolve(root, 'lib/ai/writing-grader.ts'), 'utf8'))
const users = strip(readFileSync(resolve(root, 'lib/admin/users.ts'), 'utf8'))

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('AI-016 — công thức (terra $2.5 in / $15 out per 1M):')
check('10k in + 20k out → $0.325', estimateGradeCostUsd('gpt-5.6-terra', { input_tokens: 10_000, output_tokens: 20_000 }) === 0.325)
check('làm tròn 4 lẻ', estimateGradeCostUsd('gpt-5.6-terra', { input_tokens: 3_333, output_tokens: 7_777 }) === 0.125)
check('0 token → 0', estimateGradeCostUsd('gpt-5.6-terra', { input_tokens: 0, output_tokens: 0 }) === 0)
check('model lạ → null (không đoán bừa)', estimateGradeCostUsd('gpt-5.6-sol', { input_tokens: 1, output_tokens: 1 }) === null)
check('model đường lui anthropic → null', estimateGradeCostUsd('claude-opus-4-8', { input_tokens: 1, output_tokens: 1 }) === null)
check('usage undefined → null', estimateGradeCostUsd('gpt-5.6-terra', undefined) === null)
check('token thiếu/NaN/âm → null',
  estimateGradeCostUsd('gpt-5.6-terra', { input_tokens: 5 }) === null &&
  estimateGradeCostUsd('gpt-5.6-terra', { input_tokens: NaN, output_tokens: 1 }) === null &&
  estimateGradeCostUsd('gpt-5.6-terra', { input_tokens: -1, output_tokens: 1 }) === null)
check('model undefined → null', estimateGradeCostUsd(undefined, { input_tokens: 1, output_tokens: 1 }) === null)

console.log('\nAI-016 — dây persist + log + admin (trước đây usage bị VỨT sau khi chấm):')
check('grader gắn provider/model vào outcome (openai + anthropic)',
  /provider: 'openai', model: OPENAI_MODEL/.test(grader) && /provider: 'anthropic', model: MODEL/.test(grader))
check('writing.ts tính est_cost_usd từ outcome', /estimateGradeCostUsd\(outcome\.model, outcome\.usage\)/.test(writing))
check('ai_score persist usage (mock thì không)', /outcome\.mock \|\| !outcome\.usage \? undefined/.test(writing) && /\.\.\.\(usage \? \{ usage \} : \{\}\)/.test(writing))
check('logEvent scoring.usage (realtime trong Vercel logs)', /logEvent\('scoring\.usage', 'info'/.test(writing))
check('log KHÔNG mang nội dung bài/PII', !/logEvent\('scoring\.usage'[^)]*task1_text/.test(writing))
check('admin đọc est_cost_usd từ ai_score.usage', /est_cost_usd: typeof s\?\.usage\?\.est_cost_usd === 'number'/.test(users))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
