// ============================================================
// PAY-006 — Outbound fetch tới provider (MoMo create, VietQR image) phải CÓ DEADLINE + đọc body CÓ CAP.
//   Trước đây fetch không AbortSignal → provider treo là request treo vô hạn (cạn kết nối); QR đọc
//   arrayBuffer() không giới hạn → body khổng lồ nuốt RAM. Đây là util net THUẦN (không secret, không
//   host động — caller dựng host CỐ ĐỊNH nên không mở SSRF); dùng lại ở momo.ts + qr-image route.
//   KHÔNG 'server-only' để test Node import trực tiếp được.
// ============================================================

export const PROVIDER_FETCH_TIMEOUT_MS = 8000 // deadline mặc định cho provider (Owner chỉnh SLA sau)
export const QR_MAX_BYTES = 512 * 1024 // 512KB — QR PNG thực tế vài KB; chặn body bất thường

// fetch có deadline: quá hạn → AbortSignal.timeout abort → throw (TimeoutError) → caller map lỗi an toàn.
export function fetchWithDeadline(
  url: string | URL,
  init: RequestInit = {},
  timeoutMs = PROVIDER_FETCH_TIMEOUT_MS,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}

// Đọc body theo STREAM, HỦY ngay khi vượt maxBytes → chặn body khổng lồ. content-length khai > cap →
//   từ chối sớm. Trả null = body quá lớn/không hợp lệ (caller → lỗi 502). Không throw.
export async function readCappedArrayBuffer(res: Response, maxBytes: number): Promise<ArrayBuffer | null> {
  const clRaw = res.headers.get('content-length')
  if (clRaw != null) {
    const cl = Number(clRaw)
    if (Number.isFinite(cl) && cl > maxBytes) return null // content-length khai vượt cap → chặn sớm
  }
  const body = res.body
  if (!body) {
    const buf = await res.arrayBuffer()
    return buf.byteLength > maxBytes ? null : buf
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > maxBytes) { await reader.cancel().catch(() => {}); return null } // vượt cap → hủy stream
      chunks.push(value)
    }
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.byteLength }
  return out.buffer
}
