// STORE-002 gate — chốt bất biến NGUỒN cho finalize-after-HEAD (chống revert về set audio_key trước PUT).
// Bổ trợ storage_finalize_smoke.mjs (hành vi seal/open AES-GCM).
//   node supabase/smoke/storage_finalize_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('STORE-002 — upload_ref mã hóa THẬT (AES-GCM), không HMAC-bọc-base64 giải ngược:')
const ur = read('lib/storage/upload-ref.ts')
check('dùng aes-256-gcm (mã hóa + tag), KHÔNG chỉ HMAC payload', /createCipheriv\('aes-256-gcm'/.test(ur) && /createDecipheriv\('aes-256-gcm'/.test(ur) && /getAuthTag|setAuthTag/.test(ur))
check('export sealUploadRef + openUploadRef', /export function sealUploadRef/.test(ur) && /export function openUploadRef/.test(ur))
check('IV ngẫu nhiên mỗi lần (randomBytes)', /randomBytes\(IV_LEN\)/.test(ur))

console.log('\nSTORE-002 — r2ObjectExists (HEAD verify):')
const r2 = read('lib/storage/r2.ts')
check('signR2Url hỗ trợ HEAD', /'GET' \| 'PUT' \| 'HEAD'/.test(r2))
check('r2ObjectExists HEAD + trả {exists, configured}', /export async function r2ObjectExists/.test(r2) && /method: 'HEAD'/.test(r2) && /configured: false/.test(r2))

console.log('\nSTORE-002 — presign KHÔNG còn set audio_key (bug gốc):')
const media = read('app/api/admin/media/route.ts')
check('nhánh audio KHÔNG update audio_key nữa', !/update\(\{ audio_key/.test(media))
check('trả upload_ref (seal) thay vì set key', /sealUploadRef\(objectKey, secret\)/.test(media) && /upload_ref/.test(media))

console.log('\nSTORE-002 — finalize route: open ref + bind test + HEAD verify → mới set key:')
const fin = read('app/api/admin/media/finalize/route.ts')
check('requireAdmin trước', /requireAdminApi\(\)/.test(fin) && fin.indexOf('requireAdminApi') < fin.indexOf('openUploadRef'))
check('openUploadRef lấy objectKey; ref sai → 400', /openUploadRef\(upload_ref, secret\)/.test(fin) && /không hợp lệ', \{ status: 400/.test(fin))
check('bind objectKey ↔ test scope (audio/{test_id}/)', /objectKey\.startsWith\(`audio\/\$\{test_id\}\/`\)/.test(fin))
check('r2ObjectExists: chưa upload → 400 (KHÔNG set key trỏ object rỗng)', /r2ObjectExists\(objectKey\)/.test(fin) && /!head\.exists\) return fail\('VALIDATION_ERROR'[\s\S]*status: 400/.test(fin))
check('object tồn tại → MỚI set audio_key', /update\(\{ audio_key: objectKey \}\)/.test(fin))
check('thiếu R2 → STORAGE_NOT_CONFIGURED', /!head\.configured\) return fail\('STORAGE_NOT_CONFIGURED'/.test(fin))

console.log('\nSTORE-002 — client uploader PUT thật + finalize:')
const form = read('components/admin/AdminTestForm.tsx')
check('uploadAudio: presign → PUT file → finalize', /uploadAudio\(file: File\)/.test(form) && /method: 'PUT', body: file/.test(form) && /\/api\/admin\/media\/finalize/.test(form))
check('KHÔNG còn placeholder doMedia', !/function doMedia/.test(form))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
