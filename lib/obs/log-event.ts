// ============================================================================
// DEPLOY-005 — Critical-event observability.
// Trước đây các sự cố nghiêm trọng (payment / security / scoring-AI / storage) chỉ để lại
// console.error/​warn dạng CHUỖI TỰ DO: không cấu trúc (khó truy vấn), không request_id (không
// tương quan được với response client), và vài chỗ nội suy thẳng error.message / id (rủi ro rò).
//
// Module này phát ra ĐÚNG 1 dòng JSON có cấu trúc + đã REDACT cho mỗi sự kiện tới hạn:
//   OBS_EVENT {"ts":…,"event":…,"severity":…,"request_id":…,"detail":{…}}
// Sink = stdout/stderr (Vercel/host tự thu). Việc định tuyến ALERT / retention / chọn nền tảng log
// (adapter đọc các dòng OBS_EVENT này) = Owner/platform — KHÔNG hard-code ở đây (chống PII/noise/cost).
//
// LUẬT THÉP:
//   • KHÔNG BAO GIỜ log secret/PII/essay/token/chữ ký. redactDetail() che theo tên khoá (substring),
//     cắt chuỗi dài, và KHÔNG dump giá trị con của object/array (chỉ tóm tắt) → không rò tình cờ.
//   • Thuần & tự chứa (không import server-only, không phụ thuộc runtime) → Node smoke import trực tiếp
//     module production này để test redaction/correlation/format thật.
// ============================================================================

export type Severity = 'info' | 'warn' | 'error' | 'critical'
const SEVERITIES: readonly Severity[] = ['info', 'warn', 'error', 'critical']

export type LogDetail = Record<string, unknown>

export type StructuredEvent = {
  ts: string
  event: string
  severity: Severity
  request_id?: string
  detail: LogDetail
}

// Khoá bị coi là nhạy cảm nếu tên (thường hoá) CHỨA một trong các mảnh dưới đây → che giá trị.
// Cố ý rộng: thà che nhầm 1 field vô hại còn hơn rò 1 secret.
const SENSITIVE_KEY_PARTS = [
  'password', 'passwd', 'secret', 'token', 'bearer', 'authorization', 'auth',
  'cookie', 'signature', 'sig', 'pepper', 'apikey', 'api_key', 'privatekey',
  'private_key', 'otp', 'session', 'essay', 'answer', 'email', 'phone', 'ssn',
]
const REDACTED = '[redacted]'
const MAX_STRING = 200 // chuỗi dài hơn → cắt (chống dump body/essay lỡ lọt vào detail)

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase()
  return SENSITIVE_KEY_PARTS.some((p) => k.includes(p))
}

// Redact 1 bag detail: che khoá nhạy cảm; cắt chuỗi dài; KHÔNG dump giá trị con của object/array.
export function redactDetail(detail: LogDetail): LogDetail {
  const out: LogDetail = {}
  for (const [key, value] of Object.entries(detail ?? {})) {
    if (value === undefined) continue
    if (isSensitiveKey(key)) { out[key] = REDACTED; continue }
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    } else if (typeof value === 'string') {
      out[key] = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…(${value.length})` : value
    } else if (Array.isArray(value)) {
      out[key] = `[array(${value.length})]` // tóm tắt độ dài, KHÔNG dump phần tử (chống rò)
    } else if (typeof value === 'object') {
      out[key] = '[object]' // KHÔNG dump khoá/giá trị con (có thể chứa PII/secret)
    } else {
      out[key] = String(value) // bigint/symbol/function → nhãn an toàn
    }
  }
  return out
}

function coerceSeverity(s: string): Severity {
  return (SEVERITIES as readonly string[]).includes(s) ? (s as Severity) : 'error' // fail-safe: lạ → error
}

// request_id để tương quan phải là token an toàn cho log (chống log-injection qua header giả).
function sanitizeRequestId(id: string | undefined): string | undefined {
  if (!id) return undefined
  return /^[\w-]{1,80}$/.test(id) ? id : undefined
}

export function buildEvent(
  event: string,
  severity: Severity | string,
  detail: LogDetail,
  opts?: { request_id?: string; ts?: string },
): StructuredEvent {
  // Thứ tự khoá cố định (ts,event,severity,request_id,detail) để log parse/diff ổn định.
  const out: StructuredEvent = {
    ts: opts?.ts ?? new Date().toISOString(),
    event,
    severity: coerceSeverity(severity),
    detail: redactDetail(detail),
  }
  const rid = sanitizeRequestId(opts?.request_id)
  // Chèn request_id ĐÚNG vị trí (giữa severity và detail) để thứ tự khoá ổn định.
  return rid
    ? { ts: out.ts, event: out.event, severity: out.severity, request_id: rid, detail: out.detail }
    : out
}

export function formatEvent(evt: StructuredEvent): string {
  return `OBS_EVENT ${JSON.stringify(evt)}`
}

// Sink có thể thay cho test; mặc định chọn kênh console theo severity (host thu stdout/stderr).
type Sink = (severity: Severity, line: string) => void
let sink: Sink | null = null
export function setLogSink(fn: Sink | null): void { sink = fn }

function defaultSink(severity: Severity, line: string): void {
  if (severity === 'error' || severity === 'critical') console.error(line)
  else if (severity === 'warn') console.warn(line)
  else console.log(line)
}

// Phát 1 sự kiện tới hạn đã cấu trúc + redact. KHÔNG ném (observability không được làm hỏng luồng).
export function logEvent(
  event: string,
  severity: Severity,
  detail: LogDetail,
  opts?: { request_id?: string },
): void {
  try {
    const evt = buildEvent(event, severity, detail, opts)
    ;(sink ?? defaultSink)(evt.severity, formatEvent(evt))
  } catch { /* observability best-effort — không bao giờ làm hỏng caller */ }
}
