// AI-010 gate — biểu đồ/hình cho đề Writing Task 1 (passage.image) phải đi HẾT đường và AN TOÀN:
//   URL chỉ từ storage allowlist (STORE-003) → schema admin nhận → sanitize strip URL lạ cả lúc lưu
//   lẫn lúc trả → orphan sweep COI ảnh đề là "đang dùng" (không thì cron XOÁ ảnh thật sau 7 ngày) →
//   WritingRunner render ảnh + render đề HTML rich (bug cũ: render text thô, học viên thấy thẻ <p>).
// PIN an ninh: sanitizer HTML content VẪN CHẶN <img> — ảnh đi qua field riêng, không mở allowlist HTML.
//     node supabase/smoke/writing_task_image_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

// Pure module cần env origin — set TRƯỚC khi import (getAllowedMediaOrigins đọc lúc gọi).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://vfnziiuxrcjloemudltj.supabase.co'
const mu = await import('../../lib/storage/media-url.ts')

const sanitize = stripComments(read('lib/sanitize/passage-html.ts'))
const admin = stripComments(read('lib/admin/tests.ts'))
const orphan = stripComments(read('app/api/cron/cleanup-orphans/route.ts'))
const runner = stripComments(read('components/writing/WritingRunner.tsx'))
const form = stripComments(read('components/admin/AdminTestForm.tsx'))

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

const OK_URL = 'https://vfnziiuxrcjloemudltj.supabase.co/storage/v1/object/public/media/images/t1/chart.png'

console.log('AI-010 — helper thuần sanitizePassageImageUrl:')
check('export tồn tại', typeof mu.sanitizePassageImageUrl === 'function')
if (typeof mu.sanitizePassageImageUrl === 'function') {
  check('URL storage hợp lệ → giữ', mu.sanitizePassageImageUrl(OK_URL) === OK_URL)
  check('host lạ → null', mu.sanitizePassageImageUrl('https://evil.com/storage/v1/object/public/media/x.png') === null)
  check('javascript: → null', mu.sanitizePassageImageUrl('javascript:alert(1)') === null)
  check('data: → null', mu.sanitizePassageImageUrl('data:image/png;base64,AAAA') === null)
  check('path không phải object public → null', mu.sanitizePassageImageUrl('https://vfnziiuxrcjloemudltj.supabase.co/rest/v1/tests') === null)
  check('không phải string → null', mu.sanitizePassageImageUrl(123) === null)
}

console.log('\nAI-010 — sanitizePassages strip ảnh URL lạ (chokepoint lưu + trả):')
check('sanitizePassages xử lý field image qua sanitizePassageImageUrl', /sanitizePassageImageUrl\(/.test(sanitize))

console.log('\nAI-010 — PIN: KHÔNG mở <img> trong HTML content:')
check("allowedTags VẪN KHÔNG có 'img'", !/allowedTags:\s*\[[^\]]*'img'/.test(sanitize))
check('comment chính sách vẫn ghi KHÔNG img', /KHÔNG script\/style-tag\/iframe\/a\/img/.test(read('lib/sanitize/passage-html.ts')))

console.log('\nAI-010 — schema + validate lưu:')
check('PassageSchema có image', /image:\s*z\.string\(\)\.max\(2000\)\.optional\(\)/.test(admin))
check('save fail-loud khi image URL lạ (isAllowedPublicMediaUrl)', /isAllowedPublicMediaUrl/.test(admin))

console.log('\nAI-010 — orphan sweep KHÔNG xoá ảnh đề đang dùng:')
// Kiểm NỐI DÂY thật, không chỉ tên hàm tồn tại (mutation từng lọt khi thay bằng new Set()).
check('cleanup-orphans GỌI collectPassageImageRefs (không phải Set rỗng)',
  /const passageImageRefs = await collectPassageImageRefs\(admin, mediaBucket\)/.test(orphan))
check('sweepBucket media NHẬN passageImageRefs', /sweepBucket\(admin, mediaBucket,[^)]*passageImageRefs\)/.test(orphan))
check('collectPassageImageRefs đọc tests.passages + parse bucket path',
  /from\('tests'\)\.select\('passages'\)/.test(orphan) && /parsePublicObjectPath\(p\?\.image/.test(orphan))
check('lỗi query passages → throw (STORE-004, không coi là rỗng)', /passages_reference_query_failed|reference_query_failed/.test(orphan))

console.log('\nAI-010 — WritingRunner render:')
check('Passage type có image', /image\?:\s*string/.test(runner))
check('render <img> từ passage.image', /<img[^>]*src=\{/.test(runner))
check('đề HTML rich render qua dangerouslySetInnerHTML (hết bug text thô)', /dangerouslySetInnerHTML/.test(runner))
check('KHÔNG còn render content như text thô trong prompt pane', !/\{\(tab === 1 \? prompts\.task1 : prompts\.task2\)\?\.content \?\?/.test(runner))

console.log('\nAI-010 — form admin:')
check('buildPayload gửi image theo passage', /image:\s*p\.image/.test(form))
check('applyDraft hydrate image (import + edit)', /out\.image = /.test(form) || /image: str\(p\.image\)/.test(form))
check('có UI upload ảnh cho passage writing', /uploadPassageImage|passage-image/.test(form))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
