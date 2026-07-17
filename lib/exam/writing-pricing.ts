// Pay-per-grade constants for AI Writing (Owner 2026-07-17).
// CLIENT-SAFE (no server-only import): server (lib/exam/writing.ts) charges coins from these; the
// WritingRunner UI reads them to show the price note. Server is still the source of truth — the client
// NEVER sends a price; it only displays these for UX.
//
// 💰 Owner đổi giá ở ĐÂY (1 chỗ). 1 coin = 1.000 VND (xem lib/payments/topup-constants.ts).
//    Chi phí AI thật ~$0.03–0.15/lượt (xem lib/ai/grade-cost.ts) ≈ 1–4 coins → 5 coins là biên an toàn.
export const FREE_GRADE_PER_DAY = 1 // số lượt chấm AI miễn phí mỗi ngày / user (trên hạn này → trừ coins)
export const GRADE_COST_COINS = 5 // coins trừ cho mỗi lượt chấm vượt hạn free
