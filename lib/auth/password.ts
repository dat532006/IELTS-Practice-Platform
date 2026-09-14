// Độ mạnh mật khẩu — dùng chung cho Register & Reset password.
// Điểm 0..5 → bucket: 0-1 Yếu, 2-3 Trung bình, 4-5 Mạnh. Cho qua submit khi level >= 1.

export function scorePassword(pw: string): number {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return s
}

// level: -1 = chưa nhập, 0 = Yếu, 1 = Trung bình, 2 = Mạnh.
export function passwordLevel(pw: string): number {
  if (pw.length === 0) return -1
  const s = scorePassword(pw)
  return s <= 1 ? 0 : s <= 3 ? 1 : 2
}

// color = màu thanh segment (trang trí); text = màu nhãn chữ ≥4.5:1 (color làm chữ chỉ 2.2–3.4:1).
export const PASSWORD_LEVELS = [
  { label: 'Yếu', color: '#EF5B5B', text: 'var(--text-error)', hint: 'thêm số hoặc ký tự đặc biệt để mạnh hơn', segs: 1 },
  { label: 'Trung bình', color: '#ECA22B', text: 'var(--badge-amber-text)', hint: 'thêm chữ hoa/thường hoặc ký tự đặc biệt', segs: 2 },
  { label: 'Mạnh', color: '#1E9E63', text: 'var(--text-success)', hint: '12+ ký tự, kết hợp nhiều loại', segs: 3 },
] as const

export const WEAK_PASSWORD_ERROR =
  'Mật khẩu quá yếu — cần ít nhất mức Trung bình (kết hợp chữ hoa/thường, số hoặc ký tự đặc biệt).'
