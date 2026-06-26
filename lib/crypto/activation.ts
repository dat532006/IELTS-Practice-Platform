import 'server-only'
import { createHmac, randomBytes } from 'node:crypto'

// ============================================================
// W14 — Activation code crypto (M08/M11). SERVER-ONLY ('server-only' chặn import client).
// LUẬT THÉP: KHÔNG lưu plaintext code — chỉ `code_hash = HMAC-SHA256(normalize(code), PEPPER)`.
//   `ACTIVATION_CODE_PEPPER` = server env secret (KHÔNG NEXT_PUBLIC_, KHÔNG log).
//   `normalize` cố định → W15 redeem chuẩn hóa input GIỐNG HỆT để ra cùng hash
//   (docs/Architecture/payment_redeem_contract.md §2).
// ============================================================

// RFC4648 base32 (không I/O nhầm? — giữ chuẩn để W15/đối soát nhất quán). 32 ký tự.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const CODE_BYTES = 10 // 80-bit entropy → đúng 16 ký tự base32 (80/5)

function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of buf) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

// Chuẩn hóa: uppercase + bỏ mọi ký tự không phải A-Z0-9 (bỏ dấu gạch/khoảng trắng).
// W15 redeem PHẢI gọi hàm này trên input người dùng để khớp hash.
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Sinh 1 mã: display (nhóm 4, dễ đọc) + canonical (đã normalize, để hash/prefix/last4).
export function generateActivationCode(): { display: string; canonical: string } {
  const canonical = base32Encode(randomBytes(CODE_BYTES)) // 16 ký tự A-Z2-7 (đã uppercase)
  const display = (canonical.match(/.{1,4}/g) ?? [canonical]).join('-') // XXXX-XXXX-XXXX-XXXX
  return { display, canonical }
}

// Pepper đã cấu hình chưa (server env). Route check trước khi sinh → 503 nếu chưa.
export function isActivationConfigured(): boolean {
  return !!process.env.ACTIVATION_CODE_PEPPER
}

// code_hash = HMAC-SHA256(normalize(code), PEPPER) hex. Nhận code thô (display HOẶC user input);
//   normalize bên trong → generation (canonical) và redeem (user input) luôn ra cùng hash.
export function hashActivationCode(code: string): string {
  const pepper = process.env.ACTIVATION_CODE_PEPPER
  if (!pepper) throw new Error('ACTIVATION_CODE_PEPPER not set') // không bao giờ hash với pepper rỗng
  return createHmac('sha256', pepper).update(normalizeCode(code), 'utf8').digest('hex')
}

// Prefix/last4 để đối soát (KHÔNG lộ toàn mã). Tính trên canonical.
export function codePrefix(canonical: string): string {
  return canonical.slice(0, 4)
}
export function codeLast4(canonical: string): string {
  return canonical.slice(-4)
}
