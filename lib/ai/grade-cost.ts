// ============================================================
// AI-016 — Ước tính chi phí 1 lượt chấm Writing từ usage token (Owner yêu cầu 2026-07-17).
// Giá $/1M token, SNAPSHOT tại thời điểm code — est_cost_usd được LƯU lúc chấm nên provider đổi giá
//   sau này KHÔNG làm sai lịch sử. Model không có trong bảng → null (không đoán bừa).
// Chưa trừ discount cached-input (ước tính hơi CAO hơn thật một chút khi prompt caching ăn) — chấp
//   nhận cho v1, ghi chú tường minh thay vì báo số đẹp không kiểm chứng.
// PURE: không import → Node smoke test trực tiếp; server import được.
// ============================================================

export type UsageLike = { input_tokens?: number; output_tokens?: number } | undefined

// USD trên 1M token. Chỉ liệt model đã KIỂM GIÁ từ docs (terra 2026-07: in $2.50 / out $15).
const PRICES_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gpt-5.6-terra': { input: 2.5, output: 15 },
}

export function estimateGradeCostUsd(model: string | undefined, usage: UsageLike): number | null {
  if (!model || !usage) return null
  const p = PRICES_PER_MTOK[model]
  if (!p) return null // model lạ/đường lui → không ước bừa
  const inTok = usage.input_tokens
  const outTok = usage.output_tokens
  if (typeof inTok !== 'number' || typeof outTok !== 'number' || !Number.isFinite(inTok) || !Number.isFinite(outTok)) return null
  if (inTok < 0 || outTok < 0) return null
  const usd = (inTok * p.input + outTok * p.output) / 1_000_000
  return Math.round(usd * 10_000) / 10_000 // 4 chữ số lẻ — đủ cho ~$0.1x/lượt
}
