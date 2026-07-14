// ============================================================
// W6 — Answer normalize (M06 scoring). PURE, deterministic.
// Dùng cho cả gap filling, MCQ, TF/NG, YN/NG.
//   - trim + collapse whitespace (mọi run khoảng trắng → 1 space)
//   - match='ci' → lowercase (case-insensitive); match='exact' → giữ nguyên hoa/thường
// KHÔNG strip dấu câu/article ở W6 (giữ deterministic; mở rộng sau nếu cần).
// ============================================================

export type MatchMode = 'ci' | 'exact'

export function normalizeAnswer(input: unknown, match: MatchMode = 'ci'): string {
  if (input == null) return ''
  let s = String(input)
  s = s.trim().replace(/\s+/g, ' ')
  if (match === 'ci') s = s.toLowerCase()
  return s
}

// ============================================================
// EXAM-005 (2026-07-15, sửa lại) — Tương đương SỐ chữ ↔ chữ-số CHỈ khi CẢ CHUỖI là số đếm THUẦN
//   ('seven' == '7', 'twenty-one' == '21', 'one hundred and five' == '105').
// Trước đây canonicalizeNumberWords đổi TỪNG cụm từ-số nhúng trong chuỗi bất kỳ → false positive
//   ngữ nghĩa: 'One Direction' → '1 direction' == key '1 direction' (chấm ĐÚNG sai). 'one' còn là
//   mạo từ/đại từ ('one way', 'one another'), ordinal/idiom cũng dính.
// Fix (conservative token grammar): chỉ coi là số khi TOÀN BỘ chuỗi là cardinal (digit thuần hoặc
//   từ-số nối space/hyphen/'and'); có BẤT KỲ token phi-số ('direction', 'days', 'cloud') → KHÔNG phải
//   số → null → không canon → không false positive. Hệ quả: số+đơn vị ('21 days' vs 'twenty-one days')
//   KHÔNG tự tương đương nữa — admin liệt kê biến thể ở answers[] (đã hỗ trợ), hoặc Owner thêm mode
//   numeric tường minh sau. Đổi lấy: KHÔNG bao giờ canon sai cụm ngữ nghĩa.
// PURE + deterministic. Chỉ dùng ở scoring mode 'ci' (exact = khớp tuyệt đối, không canon).
// ============================================================

const NUM_UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
}
const NUM_TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}
const isNumWord = (w: string) => w in NUM_UNITS || w in NUM_TENS || w === 'hundred' || w === 'thousand'

// Tính giá trị 1 cụm từ-số (đã tách 'and'). Trả null nếu cụm không hợp lệ (vd 'one one').
function evalNumWords(words: string[]): number | null {
  let total = 0
  let current = 0
  let lastRank = Infinity // chống 'one one' / 'twenty ten' (rank phải giảm dần trong nhóm)
  for (const w of words) {
    if (w === 'hundred') {
      if (current === 0) return null
      current *= 100
      lastRank = Infinity
    } else if (w === 'thousand') {
      if (current === 0) return null
      total += current * 1000
      current = 0
      lastRank = Infinity
    } else if (w in NUM_TENS) {
      if (lastRank <= 2) return null
      current += NUM_TENS[w]
      lastRank = 2
    } else if (w in NUM_UNITS) {
      const v = NUM_UNITS[w]
      const rank = v >= 10 ? 2 : 1 // teen chiếm cả hàng chục+đơn vị
      if (lastRank <= rank) return null
      current += v
      lastRank = rank
    } else return null
  }
  return total + current
}

// Giá trị số ĐẾM của TOÀN BỘ chuỗi, hoặc null nếu chuỗi KHÔNG phải cardinal thuần.
//   - digit thuần: '7' → 7, '105' → 105 (tối đa 9 chữ số, chống overflow/id lạ).
//   - từ-số: 'seven' → 7, 'twenty one'/'twenty-one' → 21, 'one hundred and five' → 105.
//   - CÓ token phi-số ('one direction', 'cloud nine', 'first', 'won', '21 days') → null.
// 'and' chỉ hợp lệ khi nằm GIỮA hai từ-số. Deterministic, không throw.
export function cardinalValue(input: unknown): number | null {
  const s = normalizeAnswer(input, 'ci') // luôn lowercase để đọc từ-số; collapse whitespace
  if (s === '') return null
  if (/^\d{1,9}$/.test(s)) return Number(s)
  // tách hyphen chỉ khi 2 phía đều là từ-số ('twenty-one' → [twenty, one]; 'e-mail' giữ nguyên → null sau).
  const tokens = s.split(' ').flatMap((t) => (t.includes('-') && t.split('-').every(isNumWord) ? t.split('-') : [t]))
  const words: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (isNumWord(t)) { words.push(t); continue }
    // 'and' nối giữa cụm số → bỏ qua; token khác bất kỳ → KHÔNG phải cardinal thuần.
    if (t === 'and' && words.length > 0 && i + 1 < tokens.length && isNumWord(tokens[i + 1])) continue
    return null
  }
  if (words.length === 0) return null
  return evalNumWords(words)
}
