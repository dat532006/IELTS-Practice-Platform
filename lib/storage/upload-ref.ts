import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// ============================================================
// STORE-002 — Opaque upload reference (finalize-after-HEAD).
// Bug: /api/admin/media (audio) set tests.audio_key TRƯỚC khi browser PUT → key trỏ object CHƯA tồn tại.
// Fix: presign PUT → client PUT → client gọi finalize → server HEAD verify object tồn tại → MỚI set audio_key.
// upload_ref bọc objectKey để server↔client trao đổi mà KHÔNG lộ raw audio_key ra client (SEC-004).
//   ⚠️ HMAC-bọc-base64 KHÔNG đủ: payload base64 giải ngược được → lộ key. Dùng AES-256-GCM (MÃ HÓA thật +
//   xác thực tag): client chỉ thấy ciphertext, không giải được nếu không có secret; sửa 1 bit → tag fail.
//   Key = sha256(secret) (secret = SUPABASE_SERVICE_ROLE_KEY, server-only). PURE (secret truyền vào → Node
//   smoke test roundtrip/opacity/tamper). Wrapper đọc env sống ở route.
// Format: base64url( iv(12) | tag(16) | ciphertext ).
// ============================================================

const IV_LEN = 12
const TAG_LEN = 16

function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest() // 32 bytes cho AES-256
}

export function sealUploadRef(objectKey: string, secret: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv)
  const ct = Buffer.concat([cipher.update(objectKey, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64url')
}

// Giải + xác thực ref → objectKey. Sai secret / bị sửa / format sai → null (GCM tag reject).
export function openUploadRef(ref: string, secret: string): string | null {
  if (typeof ref !== 'string' || ref.length === 0) return null
  try {
    const buf = Buffer.from(ref, 'base64url')
    if (buf.length <= IV_LEN + TAG_LEN) return null
    const iv = buf.subarray(0, IV_LEN)
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
    const ct = buf.subarray(IV_LEN + TAG_LEN)
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), iv)
    decipher.setAuthTag(tag)
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]) // final() ném nếu tag không khớp
    const key = pt.toString('utf8')
    return key.length > 0 ? key : null
  } catch {
    return null // tag mismatch / sai secret / format hỏng
  }
}
