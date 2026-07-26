// Tô sáng phần giải thích trong CHẾ ĐỘ XEM LẠI cho dễ đọc — cùng ngôn ngữ thị giác với phần chấm
// Writing (`components/writing/WritingFeedback.tsx`): cụm trong ngoặc kép và từ VIẾT HOA chuyển tím.
//
// Chỉ đụng cách HIỂN THỊ. Không sửa, không cắt, không sắp xếp lại chữ của explanation — mọi ký tự
// gốc đều được in ra nguyên vẹn (kể cả xuống dòng, vì .dcx-explain-text đang `white-space: pre-line`).
//
// Luật tô, rút ra từ 317 explanation thật của VOL9:
//   • Ngoặc kép “…” (868 cụm) và ‘…’ (6 cụm) — KHÔNG bắt nháy đơn thẳng/cong lẻ vì trong bài chúng
//     hầu hết là dấu lược của tiếng Anh (Ray’s, mother’s), tô vào là hỏng.
//   • Cụm VIẾT HOA từ 2 chữ cái trở lên: NOT GIVEN, ONE WORD ONLY, TRUE/FALSE/YES/NO, RFDS, BCE,
//     và các cụm tiếng Việt được nhấn (THÓI QUEN ĂN UỐNG…). Dùng \p{Lu} chứ KHÔNG dùng dải mã tự
//     chế: dải [Ạ-ỹ] chứa CẢ chữ thường có dấu nên "ươ"/"ườ" sẽ bị nhận nhầm là viết hoa.
//   • Chữ cái đơn A–Z đứng riêng (phương án A/B/C…). Giới hạn ở A–Z để không tô nhầm những từ tiếng
//     Việt một chữ cái viết hoa đầu câu như "Ở", "Ý".
import type { ReactNode } from 'react'

const EMPHASIS_RE =
  /“[^”\n]{1,200}”|"[^"\n]{1,200}"|‘[^’\n]{1,200}’|\p{Lu}[\p{Lu}\p{M}]+(?:[  ]+\p{Lu}[\p{Lu}\p{M}]+)*|\b[A-Z]\b/gu

// `\b` chỉ hiểu chữ ASCII nên nó coi ranh giới giữa "ư" và "A" là hợp lệ → tự kiểm hai bên cho chắc.
const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{M}\p{N}]/u.test(ch)

export function ExplainRichText({ text }: { text: string }) {
  const out: ReactNode[] = []
  let cut = 0
  for (const m of text.matchAll(EMPHASIS_RE)) {
    const at = m.index ?? 0
    const raw = m[0]
    if (raw.length === 1 && (isWordChar(text[at - 1]) || isWordChar(text[at + 1]))) continue
    if (at > cut) out.push(text.slice(cut, at))
    out.push(
      <b key={at} className="dcx-em">
        {raw}
      </b>,
    )
    cut = at + raw.length
  }
  if (cut < text.length) out.push(text.slice(cut))
  return <>{out}</>
}
