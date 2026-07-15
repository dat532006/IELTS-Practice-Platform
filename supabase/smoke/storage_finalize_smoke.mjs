// STORE-002 — finalize-after-HEAD: upload_ref = AES-256-GCM MÃ HÓA objectKey (client↔server trao đổi mà
// KHÔNG lộ raw audio_key — SEC-004: ciphertext không giải ngược nếu không có secret); finalize giải để lấy
// objectKey + verify HEAD. Import helper production. node supabase/smoke/storage_finalize_smoke.mjs
import { sealUploadRef, openUploadRef } from '../../lib/storage/upload-ref.ts'

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

const SECRET = 'test-service-role-secret-xyz-32bytes-plus'
const KEY = 'audio/1f2e3d4c-5b6a-7890-1234-567890abcdef/1720000000-lecture.mp3'

console.log('STORE-002 — seal/open roundtrip:')
{
  const ref = sealUploadRef(KEY, SECRET)
  check('open(ref) → lấy lại đúng objectKey', openUploadRef(ref, SECRET) === KEY)
  const ref2 = sealUploadRef(KEY, SECRET)
  check('mỗi lần seal ra ref khác (IV ngẫu nhiên)', ref !== ref2)
  check('cả 2 ref đều mở về cùng key', openUploadRef(ref2, SECRET) === KEY)
}

console.log('\nSTORE-002 — SEC-004: ciphertext KHÔNG lộ raw audio_key (không giải ngược được):')
{
  const ref = sealUploadRef(KEY, SECRET)
  check('ref KHÔNG chứa scope/path plaintext', !ref.includes('audio/') && !ref.includes('lecture') && !ref.includes(KEY.split('/')[1]))
  // Thử base64url-decode payload (kiểu HMAC-bọc-base64 cũ) → KHÔNG ra objectKey (đã mã hóa).
  const decoded = Buffer.from(ref, 'base64url').toString('latin1')
  check('base64-decode ciphertext KHÔNG ra objectKey đọc được', !decoded.includes('audio/') && !decoded.includes('lecture.mp3'))
}

console.log('\nSTORE-002 — chống giả mạo / sai secret:')
{
  const ref = sealUploadRef(KEY, SECRET)
  check('sai secret → null', openUploadRef(ref, 'another-secret') === null)
  // Lật 1 byte trong ciphertext → GCM tag fail → null.
  const buf = Buffer.from(ref, 'base64url'); buf[buf.length - 1] ^= 0xff
  check('sửa 1 byte ciphertext → null (GCM tag reject)', openUploadRef(buf.toString('base64url'), SECRET) === null)
  // Lật byte trong tag → null.
  const buf2 = Buffer.from(ref, 'base64url'); buf2[13] ^= 0xff
  check('sửa tag → null', openUploadRef(buf2.toString('base64url'), SECRET) === null)
  check('rác/format sai → null', openUploadRef('not-base64-!!!', SECRET) === null && openUploadRef('', SECRET) === null)
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
