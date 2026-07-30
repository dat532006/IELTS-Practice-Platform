// AI-006 gate — tripwire chống revert cho 2 bug authoring Writing (Owner báo 2026-07-17):
//   BUG 1: hợp đồng task1/task2 copy tay 2 nơi + form sinh id uid('p') → mapping rơi về VỊ TRÍ,
//          đảo passage là tráo đề Task 1 ↔ Task 2 âm thầm.
//   BUG 2: lint form bỏ qua writing (if type !== 'writing') VÀ SQL guard thoát sớm cho writing
//          → publish được đề prompt RỖNG, AI chấm với task1_prompt=''.
// Kiểm 4 tầng: module thuần (hành vi) → 2 runtime dùng chung → form normalize+lint → SQL guard + check41.
//     node supabase/smoke/writing_authoring_gate.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
// Bóc comment trước khi assert — comment nhắc tên hàm sẽ làm regex xanh giả khi code thật bị xoá
// (bẫy đã dính 2 lần: obs_event_gate 'server-only', writing_rich_feedback_gate MUT4).
// THỨ TỰ QUAN TRỌNG: bóc line-comment TRƯỚC block-comment — line comment chứa chuỗi '/*' (vd
// "/api/admin/* requireAdmin") sẽ mở block giả nuốt hàng chục nghìn ký tự tới '*/' gần nhất.
const stripComments = (s) =>
  s.replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

const mod = await import('../../lib/exam/writing-prompts.ts')
const form = stripComments(read('components/admin/AdminTestForm.tsx'))
const server = stripComments(read('lib/exam/writing.ts'))
const runner = stripComments(read('components/writing/WritingRunner.tsx'))
const rls = stripComments(read('supabase/tests/rls_smoke.sql'))

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('AI-006 — BUG 1: một hợp đồng, hai runtime dùng chung:')
check('lib/exam/writing.ts dùng pickTaskPassage', /pickTaskPassage\(arr, 0, 'task1'\)/.test(server))
check('WritingRunner dùng pickTaskPassage', /pickTaskPassage\(arr, 0, 'task1'\)/.test(runner))
check('KHÔNG còn bản copy tay hợp đồng ở server', !/arr\.find\(\(p\) => p\?\.id === id\)/.test(server))
check('KHÔNG còn bản copy tay hợp đồng ở runner', !/arr\.find\(\(p\) => p\?\.id === id\)/.test(runner))
// Hành vi lõi chống tráo đề — chạy trên module PRODUCTION:
const t1 = { id: 'task1', content: 'Đề 1' }, t2 = { id: 'task2', content: 'Đề 2' }
check('id thắng vị trí (mảng đảo vẫn đúng task)', mod.pickTaskPassage([t2, t1], 0, 'task1') === t1)
const swapped = mod.normalizeWritingPassageIds([t2, t1])
check('normalize GIỮ id task đứng sai vị trí (không tráo)', swapped[0].id === 'task2' && swapped[1].id === 'task1')

console.log('\nAI-006 — BUG 1: form ép id task1/task2 lúc lưu:')
check('buildPayload: writing → normalizeWritingPassageIds',
  /passages:\s*type === 'writing' \? normalizeWritingPassageIds\(pOut\) : pOut/.test(form))
check('form import từ module hợp đồng chung', /from '@\/lib\/exam\/writing-prompts'/.test(form))

console.log('\nAI-006 — BUG 2: lint form KHÔNG còn bỏ qua writing:')
check('lint có nhánh writing gọi lintWritingPrompts',
  /type === 'writing'[\s\S]{0,300}lintWritingPrompts\(passages\)/.test(form))
check('lỗi writing là ERROR (không phải warn)',
  /lintWritingPrompts\(passages\)\) out\.push\(\{ level: 'error'/.test(form))
check('nhánh reading/listening giữ nguyên (passage trống vẫn warn)',
  /Passage \$\{i \+ 1\}[^`]*đang trống/.test(form))

console.log('\nAI-011 — form Writing KHÔNG hiện/mang phần câu hỏi & đáp án:')
// Bám vào id của khối (#sec-questions — chính là đích của link nhảy mục), KHÔNG bám className:
//   khối này về sau được thêm `id`/`scroll-mt-24` cho thanh điều hướng trong form và check literal cũ
//   gãy ngay, dù điều kiện `type !== 'writing'` vẫn nguyên vẹn.
check("khối questions builder bọc điều kiện type !== 'writing'",
  /\{type !== 'writing' && \(\s*<div[^>]*id="sec-questions"/.test(form))
check("buildPayload: writing → questions []", /questions:\s*type === 'writing' \? \[\] : qOut/.test(form))
check("buildPayload: writing → answer_keys {} (xoá key rác nếu đề từng là reading)",
  /answer_keys:\s*type === 'writing' \? \{\} : answer_keys/.test(form))
check('lint bỏ toàn bộ check câu hỏi khi writing', /if \(type === 'writing'\) return out/.test(form))

console.log('\nAI-012 — Xem giao diện thi cho Writing (preview không-API):')
const wrunner = stripComments(read('components/writing/WritingRunner.tsx'))
check('WritingRunner nhận prop preview', /preview\?: \{ payload: ExamPayload \}/.test(wrunner))
check('preview → bơm payload + active, KHÔNG fetch', /if \(preview\) \{\s*setPayload\(preview\.payload\)\s*setPhase\('active'\)\s*return\s*\}/.test(wrunner))
// AI-013: chỉ CÒN 1 CTA (nộp = chấm, 1 hành động) — nút "Chấm bằng AI" riêng đã bỏ.
check('preview khoá nút nộp (CTA duy nhất)', (wrunner.match(/disabled=\{!!preview \|\| !canSubmit \|\| submitting\}/g) ?? []).length === 1)
check('KHÔNG còn nút "Chấm bằng AI" riêng (gợi ý sai chấm-không-nộp)', !/Chấm bằng AI'/.test(wrunner))
check('CTA nói thật cả hai việc', /Nộp bài & chấm AI/.test(wrunner))

console.log('\nAI-014/015 — gợi ý dàn bài rich, nút vuông toggle:')
const adminSrc = stripComments(read('lib/admin/tests.ts'))
const sanitizeSrc = stripComments(read('lib/sanitize/passage-html.ts'))
check('PassageSchema có hint (cap 8000 cho HTML)', /hint:\s*z\.string\(\)\.max\(8000\)\.optional\(\)/.test(adminSrc))
check('sanitizePassages sanitize hint rich (cùng allowlist passage)', /isRichHtml\(rec\.hint\)/.test(sanitizeSrc) && /hint: sanitizePassageHtml\(rec\.hint\)/.test(sanitizeSrc))
check('KHÔNG còn khối "Gợi ý dàn bài" CỨNG trong runner', !/Mở bài: giới thiệu chủ đề/.test(wrunner))
check('nút TOGGLE (bấm mở, bấm lại đóng)', /setHintOpen\(\(h\) => \(\{ \.\.\.h, \[tab\]: !h\[tab\] \}\)\)/.test(wrunner))
check('hint rich render qua dangerouslySetInnerHTML + dcx-rich', /dcx-w-hint-body dcx-rich[^>]*dangerouslySetInnerHTML=\{\{ __html: hint \}\}/.test(wrunner))
check('hint plain cũ giữ nhánh text pre-line', /whiteSpace: 'pre-line' \}\}>\{hint\}/.test(wrunner))
check('rỗng HTML vỏ → không nút (isBlankHtml)', /isBlankHtml\(hint\)/.test(wrunner))
check('form soạn hint bằng RichTextEditor (như passage)', /data-passage-hint[\s\S]{0,600}<RichTextEditor/.test(form))
check('payload chặn hint rỗng-vỏ ở CẢ save lẫn preview', (form.match(/!isBlankHtml\(p\.hint\) \? \{ hint: p\.hint \}/g) ?? []).length === 2)
check('applyDraft sanitize hint rich client-side (SEC-006)', /out\.hint = looksRich\(rawHint\) \? sanitizePassageHtmlClient\(rawHint\) : rawHint/.test(form))
check('form: overlay chọn WritingRunner cho writing', /type === 'writing' \? \(\s*<WritingRunner testId="__admin_preview__" preview=\{\{ payload: examPreview\.payload \}\}/.test(form))
check('form: nút preview KHÔNG còn disabled với writing', !/disabled=\{type === 'writing'\}/.test(form))
check('form: payload preview mang image + id chuẩn hoá', /type === 'writing' \? normalizeWritingPassageIds\(passages\) : passages/.test(form))

console.log('\nAI-006 — BUG 2: SQL publish guard chặn writing rác:')
const migs = readdirSync(resolve(root, 'supabase/migrations')).filter((f) => f >= '20260717')
const guardMig = migs.find((f) => /writing_publish_guard/.test(f))
check('có migration MỚI (không sửa migration đã applied)', !!guardMig, `migs sau 17/07: ${migs.join(',')}`)
const sql = guardMig ? stripComments(read(`supabase/migrations/${guardMig}`)) : ''
check("guard có nhánh v_type = 'writing'", /if v_type = 'writing' then/.test(sql))
// Chặn bypass rẻ tiền "then return; end if" — sau khi bóc comment, câu lệnh ĐẦU TIÊN của nhánh writing
// phải là check độ dài passages (không được return sớm). Ngữ nghĩa SQL đầy đủ do check41 (db:verify
// trên PG thật) chứng minh — gate nguồn chỉ chặn tamper thô.
check('nhánh writing KHÔNG return trước validate (câu đầu = check 2 passages)',
  /if v_type = 'writing' then\s*if jsonb_typeof\(v_passages\)/.test(sql))
check("KHÔNG tồn tại bypass \"if v_type = 'writing' then return\" Ở BẤT KỲ ĐÂU",
  !/if v_type = 'writing' then\s*return/.test(sql))
check('đòi ĐÚNG 2 passage', /jsonb_array_length\(v_passages\) <> 2/.test(sql))
check('đòi id task1+task2 mỗi cái đúng 1 lần', /array\['task1', 'task2'\]/.test(sql) && /v_cnt <> 1/.test(sql))
check('check rỗng SAU khi bóc HTML + &nbsp;', /regexp_replace\(replace\(coalesce\(v_content, ''\), '&nbsp;', ' '\), '<\[\^>\]\*>', ' ', 'g'\)/.test(sql))
check('KHÔNG nới phần reading/listening (questions required còn nguyên)', /INVALID_GRAPH: questions required/.test(sql))
check('KHÔNG nới listening audio', /listening audio required/.test(sql))
check('giữ IS DISTINCT FROM null-guard (bản 000500)', /is distinct from 'array'/.test(sql))

console.log('\nAI-006 — check41 trong db:verify:')
check('rls_smoke có check41a (id sai/prompt rỗng bị chặn)', /check41a/.test(rls))
check('rls_smoke có check41b (rỗng HTML vỏ bị chặn)', /<p><br><\/p>/.test(rls) && /check41b/.test(rls))
check('rls_smoke có check41c (đề chuẩn publish OK — guard không siết quá tay)', /check41c/.test(rls))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
