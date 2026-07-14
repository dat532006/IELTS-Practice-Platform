// Number-word equivalence gate (EXAM-005) — unit gate cho cardinalValue: CHỈ chuỗi SỐ ĐẾM THUẦN mới ra
// giá trị; cụm có token phi-số ('One Direction', 'one way', 'cloud nine', ordinals, idioms, số+đơn vị)
// → null → không tương đương → không false positive. Import trực tiếp normalize.ts (self-contained, Node
// v24 type-stripping). Không cần server/DB.   node supabase/smoke/number_word_equivalence_gate.mjs
import { cardinalValue } from '../../lib/scoring/normalize.ts'

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

// ===== SỐ ĐẾM THUẦN → giá trị (word ↔ digit tương đương qua cùng value) =====
console.log('CARDINAL thuần (phải ra đúng value):')
const cardinals = [
  ['7', 7], ['seven', 7], ['zero', 0], ['0', 0],
  ['twenty-one', 21], ['twenty one', 21], ['21', 21],
  ['one hundred and five', 105], ['105', 105],
  ['one hundred', 100], ['one thousand', 1000], ['1000', 1000],
  ['nineteen', 19], ['ninety', 90], ['ninety-nine', 99],
]
for (const [s, v] of cardinals) check(`cardinalValue(${JSON.stringify(s)}) === ${v}`, cardinalValue(s) === v, `got=${cardinalValue(s)}`)
// word == digit ⇔ cùng value:
check('seven ⇔ 7 (cùng value)', cardinalValue('seven') === cardinalValue('7'))
check('twenty-one ⇔ 21', cardinalValue('twenty-one') === cardinalValue('21'))

// ===== CỤM ngữ nghĩa / phi-cardinal → null (không tương đương) =====
console.log('\nPHI-cardinal (phải = null → không false positive):')
const nulls = [
  'One Direction', 'one direction', '1 direction', 'one way', 'cloud nine',
  'won', 'first', 'second', 'twenty-one days', '21 days', 'seven days',
  'e-mail', 'no one', 'one another', 'the one', '', '3.5', '1,000', '5km',
]
for (const s of nulls) check(`cardinalValue(${JSON.stringify(s)}) === null`, cardinalValue(s) === null, `got=${cardinalValue(s)}`)

// headline: 'One Direction' KHÔNG tương đương '1 direction' (cả hai null ⇒ không match qua fallback số)
check('One Direction ⊥ 1 direction (không cùng value số)', !(cardinalValue('One Direction') != null && cardinalValue('One Direction') === cardinalValue('1 direction')))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
