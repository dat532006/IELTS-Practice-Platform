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
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  EXAM_LOCKED: 'EXAM_LOCKED', // W4: premium payload chưa unlock (is_free=false & không có test_unlocks)
  RESULT_NOT_READY: 'RESULT_NOT_READY', // W8: attempt còn in_progress → chưa trả review/đáp án
  ATTEMPT_TERMINAL: 'ATTEMPT_TERMINAL', // W9: attempt đã nộp → không autosave đáp án nữa
  AI_UNAVAILABLE: 'AI_UNAVAILABLE', // W10: AI grader lỗi/refusal/invalid output → không lưu (502)
  WORD_COUNT_TOO_LOW: 'WORD_COUNT_TOO_LOW', // W10: Task 1 < 150 hoặc Task 2 < 250 từ (server đếm)
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

function newRequestId() {
  return 'req_' + Math.random().toString(36).slice(2, 10)
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
