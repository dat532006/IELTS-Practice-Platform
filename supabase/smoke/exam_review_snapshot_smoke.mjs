// EXAM-003/009 — snapshot-at-start: review đọc nội dung ĐÃ CHỤP lúc START (độc lập published visibility +
// cố định khi đề bị sửa). Import helper production pickReviewContent. Pre-fix RED: module chưa tồn tại.
//   node supabase/smoke/exam_review_snapshot_smoke.mjs
import { pickReviewContent } from '../../lib/exam/review-content.ts'

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('EXAM-009 — có snapshot → dùng NỘI DUNG ĐÃ CHỤP (không trôi khi đề bị sửa):')
{
  const snapshot = { passages: [{ id: 'p1', content: 'ORIGINAL passage' }], questions: [{ id: 'q1', number: 1, type: 'mcq' }] }
  const current = { passages: [{ id: 'p1', content: 'EDITED passage' }], questions: [{ id: 'q1', number: 99, type: 'gap' }] } // đề đã bị sửa sau khi thi
  const r = pickReviewContent(snapshot, current)
  check('passages = bản chụp (ORIGINAL, không phải EDITED)', JSON.stringify(r.passages) === JSON.stringify(snapshot.passages))
  check('questions = bản chụp (number 1/type mcq, không phải 99/gap)', JSON.stringify(r.questions) === JSON.stringify(snapshot.questions))
  check('stale = false (có bản chụp)', r.stale === false)
}

console.log('\nEXAM-003 — không snapshot (attempt cũ) → fallback nội dung hiện tại + cờ stale:')
{
  const current = { passages: [{ id: 'p1', content: 'CURRENT' }], questions: [{ id: 'q1', number: 1 }] }
  const r = pickReviewContent(null, current)
  check('passages = hiện tại (fallback)', JSON.stringify(r.passages) === JSON.stringify(current.passages))
  check('questions = hiện tại (fallback)', JSON.stringify(r.questions) === JSON.stringify(current.questions))
  check('stale = true (báo "bản gốc có thể đã đổi")', r.stale === true)
}

console.log('\nEXAM-003 — snapshot với passages rỗng/null vẫn ưu tiên bản chụp (không lẫn current):')
{
  const snapshot = { passages: null, questions: [{ id: 'q1' }] }
  const current = { passages: [{ id: 'p1', content: 'CURRENT' }], questions: [{ id: 'qX' }] }
  const r = pickReviewContent(snapshot, current)
  check('có bản ghi snapshot → dùng snapshot dù passages null (không rơi về current)', r.passages === null && r.stale === false)
  check('questions vẫn của snapshot', JSON.stringify(r.questions) === JSON.stringify(snapshot.questions))
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
