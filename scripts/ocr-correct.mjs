#!/usr/bin/env node
// ============================================================
// OCR dictionary post-correction cho PROSE (offline, nspell + dictionary-en-gb — British để không
//   đổi centre→center). CHỦ TRƯƠNG: PRECISION > RECALL — thà bỏ sót còn hơn sửa sai làm hỏng thêm.
//   Chỉ sửa khi: từ sai chính tả + có ĐÚNG 1 gợi ý duy nhất, edit-distance ≤ 2, cùng chữ đầu HOẶC cuối,
//   độ dài ≥ 4, KHÔNG viết hoa đầu (tên riêng/đầu câu), KHÔNG ALL-CAPS. Lỗi mập mờ (cne/twe) để NGUYÊN.
//   Ghi <page>.corrected.txt + _combined.corrected.md + _corrections.log (audit mọi thay đổi).
//
//   ⚠️ CHỈ dùng cho passage prose. TUYỆT ĐỐI KHÔNG cho answer_keys (sai key = chấm sai) — verify tay.
//
// Usage: node scripts/ocr-correct.mjs <dir-hoặc-file> [--min N] [--dist N]
//   vd: node scripts/ocr-correct.mjs ocr-output/AC_
// ============================================================
import nspell from 'nspell'
import dictionary from 'dictionary-en-gb'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'

const args = process.argv.slice(2)
if (!args[0] || args[0].startsWith('--')) {
  console.error('Usage: node scripts/ocr-correct.mjs <dir|file> [--min 4] [--dist 2]')
  process.exit(1)
}
const target = resolve(args[0])
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d }
const MIN_LEN = Math.max(3, parseInt(opt('min', '4'), 10) || 4)
const MAX_DIST = Math.max(1, parseInt(opt('dist', '2'), 10) || 2)

const spell = nspell(dictionary)

// Levenshtein có chặn trần (đủ cho từ ngắn).
function editDistance(a, b) {
  const m = a.length, n = b.length
  if (Math.abs(m - n) > MAX_DIST) return MAX_DIST + 1
  const dp = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return dp[n]
}

function decide(word) {
  if (/['’]/.test(word)) return null // chứa nháy (doesn't, town's) → bỏ (tránh tách nhầm contraction)
  if (word.length < MIN_LEN) return null
  if (/[A-Z]/.test(word[0])) return null // viết hoa đầu → tên riêng / đầu câu → bỏ (an toàn)
  if (word === word.toUpperCase()) return null // ALL-CAPS
  if (spell.correct(word)) return null // đã đúng
  const sugg = spell.suggest(word)
  if (sugg.length !== 1) return null // >1 gợi ý = mập mờ → KHÔNG đoán
  const cand = sugg[0]
  if (/[A-Z]/.test(cand[0])) return null // gợi ý là tên riêng → bỏ
  if (Math.abs(word.length - cand.length) > 1) return null // chênh dài >1 → có thể nuốt tiền/hậu tố (atleast→least) → bỏ
  const d = editDistance(word.toLowerCase(), cand.toLowerCase())
  if (d < 1 || d > MAX_DIST) return null
  const sameEnd = word[0].toLowerCase() === cand[0].toLowerCase() || word[word.length - 1].toLowerCase() === cand[cand.length - 1].toLowerCase()
  if (!sameEnd) return null // khác cả chữ đầu lẫn cuối → rủi ro cao → bỏ
  return cand
}

function correctText(text) {
  const changes = []
  const out = text.replace(/[A-Za-z]+(?:['’][A-Za-z]+)*/g, (w) => {
    const c = decide(w)
    if (c == null) return w
    changes.push([w, c])
    return c
  })
  return { text: out, changes }
}

async function listFiles(t) {
  if (statSync(t).isFile()) return [t]
  const names = await readdir(t)
  return names.filter((n) => /^page-\d+\.txt$/.test(n)).sort().map((n) => join(t, n))
}

const files = await listFiles(target)
if (files.length === 0) { console.error('Không tìm thấy page-*.txt trong', target); process.exit(1) }
const outDir = statSync(target).isFile() ? resolve(target, '..') : target

let totalWords = 0, totalChanges = 0
const combined = []
const log = []
const freq = new Map()
for (const f of files) {
  const raw = await readFile(f, 'utf8')
  totalWords += (raw.match(/[A-Za-z]+/g) || []).length
  const { text, changes } = correctText(raw)
  totalChanges += changes.length
  for (const [a, b] of changes) { const k = `${a} → ${b}`; freq.set(k, (freq.get(k) || 0) + 1) }
  const outName = basename(f).replace(/\.txt$/, '.corrected.txt')
  await writeFile(join(outDir, outName), text, 'utf8')
  combined.push(`\n\n===== ${basename(f)} =====\n\n${text}`)
  if (changes.length) log.push(`${basename(f)}: ${changes.map(([a, b]) => `${a}→${b}`).join(', ')}`)
}
await writeFile(join(outDir, '_combined.corrected.md'), combined.join('\n').trim() + '\n', 'utf8')
await writeFile(join(outDir, '_corrections.log'), log.join('\n') + '\n', 'utf8')

console.log(`Corrected ${files.length} file · ${totalChanges}/${totalWords} từ sửa (${((totalChanges / Math.max(1, totalWords)) * 100).toFixed(2)}%) — precision-first, chỉ sửa unambiguous`)
console.log('Top thay đổi:')
for (const [k, n] of [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${n}×  ${k}`)
console.log(`→ ${outDir}/_combined.corrected.md · _corrections.log (audit đầy đủ)`)
