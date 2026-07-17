// Pay-per-grade smoke — trừ coins cho lượt chấm AI Writing vượt hạn free/ngày (Owner 2026-07-17).
// Static-source + import hằng số THẬT (như grade_cost_smoke): CI chạy không cần DB. Hành vi RPC atomic
// (debit/insufficient/refund/ledger) đã verify trực tiếp trên local Supabase khi phát triển.
//     node supabase/smoke/writing_paygrade_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { FREE_GRADE_PER_DAY, GRADE_COST_COINS } from '../../lib/exam/writing-pricing.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
const writing = read('lib/exam/writing.ts')
const route = read('app/api/grade-writing/route.ts')
const ui = read('components/writing/WritingRunner.tsx')
const mig = read('supabase/migrations/20260717000200_ai_grade_coin_spend.sql')

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('Hằng số giá (client-safe, 1 nguồn):')
check('FREE_GRADE_PER_DAY = 1 (1 lượt free/ngày)', FREE_GRADE_PER_DAY === 1, `=${FREE_GRADE_PER_DAY}`)
check('GRADE_COST_COINS là số nguyên dương', Number.isInteger(GRADE_COST_COINS) && GRADE_COST_COINS > 0, `=${GRADE_COST_COINS}`)

console.log('\nMigration RPC (mirror checkout: conditional-debit + ledger):')
check('spend_ai_grade(uuid,integer) khai báo', /function public\.spend_ai_grade\(p_user_id uuid, p_cost integer\)/.test(mig))
check('conditional debit coins >= cost (0 row = thiếu)', /coins = coins - p_cost/.test(mig) && /coins >= p_cost/.test(mig))
check('ledger spend = âm, type=spend, provider=system', /amount_coins, type, provider, status/.test(mig) && /-p_cost, 'spend', 'system', 'success'/.test(mig))
check('refund_ai_grade_coins hoàn + ghi type=refund', /function public\.refund_ai_grade_coins/.test(mig) && /p_cost, 'refund', 'system', 'success'/.test(mig))
check('client KHÔNG execute (revoke) + grant service_role', /revoke all on function public\.spend_ai_grade/.test(mig) && /grant execute on function public\.spend_ai_grade\(uuid, integer\) to service_role/.test(mig))
check('cost<=0 phòng thủ (no-op OK)', /p_cost is null or p_cost <= 0/.test(mig))

console.log('\nsubmitWritingGrade — free trước, vượt hạn thì TRỪ coins:')
check('import hằng số giá', /import \{ FREE_GRADE_PER_DAY, GRADE_COST_COINS \} from '@\/lib\/exam\/writing-pricing'/.test(writing))
check('pro vẫn bypass (unlimited free)', /if \(plan !== 'pro'\)/.test(writing))
check('vượt FREE_GRADE_PER_DAY → gọi spend_ai_grade', /rc > FREE_GRADE_PER_DAY/.test(writing) && /admin\.rpc\('spend_ai_grade'/.test(writing))
check('thiếu coins → INSUFFICIENT_COINS kèm balance/needed', /code: 'INSUFFICIENT_COINS', balance:/.test(writing) && /needed: spend\?\.needed/.test(writing))
check('rollback hoàn coins khi fail (AI/finalize)', /refund_ai_grade_coins/.test(writing) && /if \(coinsCharged > 0\)/.test(writing))
check('coins_charged persist vào ai_score + result', (writing.match(/coins_charged: coinsCharged/g) || []).length >= 2)
check('KHÔNG còn RATE_LIMITED khi hết free (đổi sang trừ coins)',
  !/rc > FREE_GRADE_PER_DAY[\s\S]{0,120}code: 'RATE_LIMITED'/.test(writing))

console.log('\nAPI route + UI:')
check('route map INSUFFICIENT_COINS (409) kèm số dư/giá', /case 'INSUFFICIENT_COINS'/.test(route) && /res\.needed/.test(route) && /res\.balance/.test(route) && /status: 409/.test(route))
check('UI đọc hằng số giá', /import \{ FREE_GRADE_PER_DAY, GRADE_COST_COINS \} from '@\/lib\/exam\/writing-pricing'/.test(ui))
check('UI xử lý INSUFFICIENT_COINS + link nạp coins', /code === 'INSUFFICIENT_COINS'/.test(ui) && /setNeedTopup\(true\)/.test(ui) && /href="\/pricing"/.test(ui))
check('UI hiện ghi chú giá (free N lượt/ngày, sau đó M coins)', /Miễn phí \$\{FREE_GRADE_PER_DAY\}/.test(ui) && /GRADE_COST_COINS\} coins\/lượt/.test(ui))
check('UI hiện coins đã dùng sau khi chấm', /coins_charged \?\? 0\) > 0/.test(ui))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
