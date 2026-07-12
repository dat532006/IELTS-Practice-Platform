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
// 2026-07-12 — Tương đương SỐ chữ ↔ số ('seven' == '7', 'twenty-one days' == '21 days').
// Chuẩn IELTS chấp nhận cả 2 cách viết số; admin không phải liệt kê thủ công từng biến thể.
// PURE + deterministic: đổi các CỤM từ-số (cardinal 0–999,999, gồm hundred/thousand/and,
//   nối bằng space/hyphen) trong chuỗi ĐÃ lowercase thành chữ số; token khác giữ nguyên.
// Hai vế so sánh cùng qua transform này → chỉ tạo lớp tương đương, không đổi kết quả các
//   đáp án không chứa từ-số (MCQ 'a'/'b', tfng 'true'… không phải từ-số → giữ nguyên).
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

// Đổi mọi cụm từ-số trong chuỗi (đã normalize ci) thành chữ số. 'and' chỉ nuốt khi nằm GIỮA cụm số.
export function canonicalizeNumberWords(s: string): string {
  const tokens = s.split(' ').flatMap((t) => (t.includes('-') && t.split('-').every(isNumWord) ? t.split('-') : [t]))
  const out: string[] = []
  let i = 0
  while (i < tokens.length) {
    if (!isNumWord(tokens[i])) {
      out.push(tokens[i])
      i++
      continue
    }
    // Gom cụm số dài nhất (cho phép 'and' giữa cụm nếu 2 phía đều là từ-số).
    const group: string[] = []
    let j = i
    while (j < tokens.length) {
      if (isNumWord(tokens[j])) group.push(tokens[j])
      else if (tokens[j] === 'and' && group.length > 0 && j + 1 < tokens.length && isNumWord(tokens[j + 1])) {
        j++
        continue
      } else break
      j++
    }
    const val = evalNumWords(group)
    if (val == null) {
      // Cụm không hợp lệ (vd 'five six') → vẫn canon TOKEN ĐẦU đứng riêng (nếu tự nó là số hợp lệ)
      //   rồi đi tiếp — giữ transform NHẤT QUÁN ('five and six' == '5 and 6').
      const single = evalNumWords([tokens[i]])
      out.push(single == null ? tokens[i] : String(single))
      i++
    } else {
      out.push(String(val))
      i = j
    }
  }
  return out.join(' ')
}
