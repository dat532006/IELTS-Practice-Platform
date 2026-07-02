#!/usr/bin/env node
// ============================================================
// Trích TEXT từ PDF — TỰ CHỌN công cụ đúng (offline, KHÔNG API):
//   • PDF có TEXT LAYER (digital, vd đề Listening)  → `pdftotext -layout` (chuẩn hơn OCR nhiều,
//     giữ nguyên cột bảng). Chỉ dọn dòng watermark.
//   • PDF SCAN ẢNH (không text layer, vd đề Reading) → tự chuyển sang OCR (scripts/ocr-pdf.mjs).
//   Cách nhận: pdftotext thử lấy text; nếu TB ký tự/trang ≥ ngưỡng ⇒ có text layer.
//
//   ⚠️ Hình/map/diagram (line-art) KHÔNG nằm trong text layer → dùng scripts/export-pdf-image.mjs
//      để render vùng hình ra PNG rồi chèn làm image asset. (Text layer chỉ có NHÃN chữ, mất đồ hoạ.)
//
// Usage: node scripts/extract-pdf.mjs <input.pdf> [--out DIR] [--force-ocr] [--raw]
//        [--min-chars N]         ngưỡng TB ký tự/trang để coi là có text layer (mặc định 80)
//        [... cờ khác sẽ chuyển tiếp cho ocr-pdf.mjs nếu phải OCR: --scale --from --to --no-regions ...]
// ============================================================
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
if (!args[0] || args[0].startsWith('--')) {
  console.error('Usage: node scripts/extract-pdf.mjs <input.pdf> [--out DIR] [--force-ocr] [--raw] [--min-chars N]')
  process.exit(1)
}
const input = args[0]
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d }
const has = (n) => args.includes(`--${n}`)
const forceOcr = has('force-ocr')
const layout = !has('raw') // -layout mặc định (giữ cột bảng); --raw để lấy dòng thuần
const minChars = parseInt(opt('min-chars', '80'), 10) || 80

const scriptDir = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(opt('out', resolve(scriptDir, '..', 'ocr-output', basename(input).replace(/\.pdf$/i, ''))))

const WATERMARKS = [/GROUP\s*[:.]?\s*(ORIGINAL|REAL)\s+(IELTS\s+)?EXAMS/i, /REAL\s+IELTS\s+EXAMS/i]
// Dọn NHẸ cho text layer: chỉ bỏ dòng watermark + gộp dòng trống thừa. GIỮ dòng ngắn ($3, A, ô bảng…).
function cleanTextLayer(t) {
  const lines = t.split(/\r?\n/).map((l) => l.replace(/[ \t]+$/g, '')).filter((l) => !WATERMARKS.some((re) => re.test(l)))
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ---- probe text layer ----
function pdftotextAvailable() {
  const r = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' })
  return !r.error
}
function runPdftotext(extraArgs) {
  const a = ['-enc', 'UTF-8', ...(layout ? ['-layout'] : []), ...extraArgs, resolve(input), '-']
  const r = spawnSync('pdftotext', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error || r.status !== 0) return null
  return r.stdout || ''
}

function delegateToOcr() {
  const passthrough = args.slice(1).filter((_, i) => true) // giữ nguyên các cờ (trừ input)
    .filter((a) => !['--force-ocr', '--raw'].includes(a))
  // loại --min-chars N (2 token)
  const clean = []
  for (let i = 0; i < passthrough.length; i++) {
    if (passthrough[i] === '--min-chars') { i++; continue }
    clean.push(passthrough[i])
  }
  if (!clean.includes('--out')) { clean.push('--out', outDir) }
  console.log(`→ Không có text layer ⇒ OCR (scripts/ocr-pdf.mjs)`)
  const r = spawnSync(process.execPath, [resolve(scriptDir, 'ocr-pdf.mjs'), resolve(input), ...clean], { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}

// ---- main ----
if (forceOcr) { delegateToOcr() }
if (!pdftotextAvailable()) {
  console.log('pdftotext không có trên PATH ⇒ chuyển OCR.')
  delegateToOcr()
}
const probe = runPdftotext([])
if (probe == null) { console.log('pdftotext lỗi ⇒ chuyển OCR.'); delegateToOcr() }
const pages = probe.split('\f')
if (pages.length && pages[pages.length - 1].trim() === '') pages.pop() // \f cuối
const nonSpace = probe.replace(/\s/g, '').length
const avg = nonSpace / Math.max(1, pages.length)
console.log(`extract: ${input}\npages ${pages.length} · ${nonSpace} ký tự · TB ${avg.toFixed(0)}/trang · ${layout ? '-layout' : 'raw'}`)

if (avg < minChars) {
  console.log(`TB ${avg.toFixed(0)} < ${minChars} ⇒ coi như SCAN.`)
  delegateToOcr()
}

// có text layer → ghi outputs (page-NNN.txt + _combined.md), giống format OCR để bước sau dùng chung.
await mkdir(outDir, { recursive: true })
const combined = []
let total = 0
for (let i = 0; i < pages.length; i++) {
  const text = cleanTextLayer(pages[i])
  total += text.length
  await writeFile(resolve(outDir, `page-${String(i + 1).padStart(3, '0')}.txt`), text, 'utf8')
  combined.push(`\n\n===== PAGE ${i + 1} =====\n\n${text}`)
}
await writeFile(resolve(outDir, '_combined.md'), combined.join('\n').trim() + '\n', 'utf8')
console.log(`DONE (text layer · pdftotext) · ${total} ký tự → ${outDir}`)
console.log(`ℹ️  Hình/map (line-art) KHÔNG có trong text — dùng: node scripts/export-pdf-image.mjs "${input}" --page <N>`)
