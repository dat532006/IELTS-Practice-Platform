import { NextResponse } from 'next/server'

// API envelope chuẩn — docs/Architecture/api_contract.md & CodingStandard.md
export type ApiMeta = { request_id: string; warnings: string[] }
export type ApiSuccess<T> = { success: true; data: T; message?: string; meta: ApiMeta }
export type ApiError = {
  success: false
  data: null
  message: string
  meta: ApiMeta & { error_code: string }
}
export type ApiResponse<T> = ApiSuccess<T> | ApiError

// Error codes — gồm failure modes của payment_redeem_contract.md §4
export const ERROR_CODES = {
  EMPTY_CART: 'EMPTY_CART',
  ALREADY_OWNED: 'ALREADY_OWNED',
  INSUFFICIENT_COINS: 'INSUFFICIENT_COINS',
  CODE_NOT_FOUND: 'CODE_NOT_FOUND',
  CODE_EXPIRED: 'CODE_EXPIRED',
  CODE_DISABLED: 'CODE_DISABLED',
  CODE_SOLD_OUT: 'CODE_SOLD_OUT',
  PAYMENT_SIGNATURE_INVALID: 'PAYMENT_SIGNATURE_INVALID',
  PAYMENT_AMOUNT_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH', // W16: paid_vnd != transactions.amount_vnd → KHÔNG credit
  PAYMENT_NOT_CONFIGURED: 'PAYMENT_NOT_CONFIGURED', // A1: gateway mode=disabled hoặc provider chưa có creds (live)
  PAYMENT_GATEWAY_ERROR: 'PAYMENT_GATEWAY_ERROR', // A1: gọi cổng thật (vd MoMo create) thất bại → 502
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  EXAM_LOCKED: 'EXAM_LOCKED', // W4: premium payload chưa unlock (is_free=false & không có test_unlocks)
  RESULT_NOT_READY: 'RESULT_NOT_READY', // W8: attempt còn in_progress → chưa trả review/đáp án
  ATTEMPT_TERMINAL: 'ATTEMPT_TERMINAL', // W9: attempt đã nộp → không autosave đáp án nữa
  ANSWERS_STALE: 'ANSWERS_STALE', // EXAM-004: expected_rev lệch answers_rev → tab cũ, KHÔNG ghi đè (409)
  AI_UNAVAILABLE: 'AI_UNAVAILABLE', // W10: AI grader lỗi/refusal/invalid output → không lưu (502)
  WORD_COUNT_TOO_LOW: 'WORD_COUNT_TOO_LOW', // W10: Task 1 < 150 hoặc Task 2 < 250 từ (server đếm)
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  STORAGE_NOT_CONFIGURED: 'STORAGE_NOT_CONFIGURED', // W12: Supabase Storage bucket / R2 PUT creds chưa cấu hình
  ACTIVATION_NOT_CONFIGURED: 'ACTIVATION_NOT_CONFIGURED', // W14: ACTIVATION_CODE_PEPPER chưa set (server)
  INTERNAL: 'INTERNAL',
} as const
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

function newRequestId() {
  return 'req_' + Math.random().toString(36).slice(2, 10)
}

// DEPLOY-005 — correlation id: ưu tiên id tương quan do proxy/hạ tầng đính (x-request-id, rồi
//   x-vercel-id) để 1 request có CÙNG id ở response client + mọi dòng log tới hạn; không có/không hợp
//   lệ → sinh mới. Sanitize (chỉ [\w-], ≤80) chống log-injection qua header giả.
export function requestIdFrom(headers: Headers): string {
  const candidate = headers.get('x-request-id') ?? headers.get('x-vercel-id') ?? ''
  return /^[\w-]{1,80}$/.test(candidate) ? candidate : newRequestId()
}

export function ok<T>(
  data: T,
  opts?: { message?: string; warnings?: string[]; request_id?: string; status?: number },
) {
  const body: ApiSuccess<T> = {
    success: true,
    data,
    message: opts?.message ?? '',
    meta: { request_id: opts?.request_id ?? newRequestId(), warnings: opts?.warnings ?? [] },
  }
  return NextResponse.json(body, { status: opts?.status ?? 200 })
}

export function fail(
  error_code: ErrorCode,
  message: string,
  opts?: { warnings?: string[]; request_id?: string; status?: number },
) {
  const body: ApiError = {
    success: false,
    data: null,
    message,
    meta: {
      error_code,
      request_id: opts?.request_id ?? newRequestId(),
      warnings: opts?.warnings ?? [],
    },
  }
  return NextResponse.json(body, { status: opts?.status ?? 400 })
}
