// ============================================================
// FB-01 — Word-level diff cho card "Lỗi & gợi ý sửa" (M07): so quote (bản gốc trong bài) với fix
//   (bản sửa tối thiểu của AI) để UI tô màu ĐÚNG phần thay đổi (gạch đỏ từ bị bỏ, nền xanh từ mới).
// PURE: không DOM/React/server-only, chỉ string — smoke .mjs import & chạy trực tiếp (TEST-006 pattern,
//   như lib/writing/highlight-segments.ts). Token = cụm ký tự không-khoảng-trắng (giữ dấu câu dính từ);
//   so sánh case-sensitive — đổi hoa/thường (vd đầu câu) cũng là một phần của "sửa".
// Thuật toán: LCS dynamic programming O(n·m). Input là quote/fix ≤ ~400 ký tự (cap Zod) → n, m nhỏ,
//   không cần tối ưu. Guard 200 token/vế để không bao giờ O(n·m) nổ với input bất thường.
// ============================================================

export type DiffOp = 'same' | 'del' | 'ins'
export type DiffToken = { text: string; op: DiffOp }

const MAX_TOKENS = 200

const tokenize = (s: string): string[] => (s.trim().match(/\S+/g) ?? []).slice(0, MAX_TOKENS)

// Diff 2 chuỗi theo từ. Trả về 2 dãy token:
//   before: từ của quote — op 'same' (giữ nguyên) hoặc 'del' (bị bỏ/thay).
//   after:  từ của fix   — op 'same' (giữ nguyên) hoặc 'ins' (mới/thay thế).
// Cả 2 dãy reconstruct lossless (join ' ' = chuỗi đã normalize whitespace).
export function diffWords(before: string, after: string): { before: DiffToken[]; after: DiffToken[] } {
  const a = tokenize(before)
  const b = tokenize(after)

  // LCS length table: dp[i][j] = LCS của a[i..] và b[j..].
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const beforeOut: DiffToken[] = []
  const afterOut: DiffToken[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      beforeOut.push({ text: a[i], op: 'same' })
      afterOut.push({ text: b[j], op: 'same' })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      beforeOut.push({ text: a[i], op: 'del' })
      i++
    } else {
      afterOut.push({ text: b[j], op: 'ins' })
      j++
    }
  }
  while (i < a.length) beforeOut.push({ text: a[i++], op: 'del' })
  while (j < b.length) afterOut.push({ text: b[j++], op: 'ins' })

  return { before: beforeOut, after: afterOut }
}

// true khi fix có nội dung THẬT và khác quote (empty/whitespace = OpenAI strict "không áp dụng";
//   giống hệt quote = không có gì để diff → UI fallback về suggestion).
export function hasUsefulFix(quote: string, fix: string | undefined): fix is string {
  if (!fix || !fix.trim()) return false
  return fix.trim() !== quote.trim()
}
