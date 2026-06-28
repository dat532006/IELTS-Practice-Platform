// W16 — Fixed-rate topup constants (M08). 1.000 VND = 1 coin.
// Tách khỏi topup.ts (server-only) để CLIENT (trang nạp) cũng dùng được cho preview/UX-validate.
// ⚠️ Đây CHỈ là hằng số hiển thị/UX — credit thật do server tính qua vndToCoins() (topup.ts).
//    Client KHÔNG bao giờ gửi amount_coins; server là nguồn sự thật.
export const COIN_VND_RATE = 1000 // VND cho 1 coin
export const MIN_TOPUP_VND = 60_000 // = 60 coins, vừa đủ 1 VOL
export const MAX_TOPUP_VND = 2_000_000 // trần giai đoạn đầu (giảm rủi ro payment/reconciliation)
