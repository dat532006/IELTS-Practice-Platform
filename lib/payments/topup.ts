import 'server-only'
import { COIN_VND_RATE, MIN_TOPUP_VND, MAX_TOPUP_VND } from './topup-constants'

// W16 — Fixed-rate topup pricing (M08). 1.000 VND = 1 coin. SERVER là nguồn DUY NHẤT tính coin.
//   Client chỉ gửi amount_vnd; KHÔNG gửi amount_coins. Reject (KHÔNG floor) nếu không chia hết COIN_VND_RATE.
export { COIN_VND_RATE, MIN_TOPUP_VND, MAX_TOPUP_VND }

export type VndToCoins =
  | { ok: true; coins: number }
  | { ok: false; reason: 'NOT_INT' | 'BELOW_MIN' | 'ABOVE_MAX' | 'NOT_DIVISIBLE' }

export function vndToCoins(amountVnd: number): VndToCoins {
  if (!Number.isInteger(amountVnd)) return { ok: false, reason: 'NOT_INT' }
  if (amountVnd < MIN_TOPUP_VND) return { ok: false, reason: 'BELOW_MIN' }
  if (amountVnd > MAX_TOPUP_VND) return { ok: false, reason: 'ABOVE_MAX' }
  if (amountVnd % COIN_VND_RATE !== 0) return { ok: false, reason: 'NOT_DIVISIBLE' }
  return { ok: true, coins: amountVnd / COIN_VND_RATE }
}
