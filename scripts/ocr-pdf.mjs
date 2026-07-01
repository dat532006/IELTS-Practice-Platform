#!/usr/bin/env node
// ============================================================
// Offline OCR cho PDF đề SCAN (self-hosted, KHÔNG API, KHÔNG cần key).
//   pdf-to-img (@napi-rs/canvas prebuilt) render trang → phân tích layout (tách CỘT + HEADER bằng
//   projection profile) → binarize (Otsu) → OCR từng vùng đúng thứ tự đọc (tesseract.js WASM, model
//   eng cache local) → cleanup watermark/nhiễu. Sửa lỗi "2 cột đọc trộn" + tăng độ chính xác.
//
//   Output = TEXT THÔ theo trang (page-NNN.txt) + _combined.md. KHÔNG cấu trúc hoá thành
//   passages/questions/answer_keys (bước riêng).
//
// Usage: node scripts/ocr-pdf.mjs <input.pdf> [--from N] [--to N] [--out DIR] [--scale S] [--lang eng]
// ============================================================
import { pdf } from 'pdf-to-img'
import { createWorker, PSM } from 'tesseract.js'
import { createCanvas, loadImage } from 'canvas'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
if (!args[0] || args[0].startsWith('--')) {
  console.error('Usage: node scripts/ocr-pdf.mjs <input.pdf> [--from N --to N --out DIR --scale S --lang eng]')
  process.exit(1)
}
const input = args[0]
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d }
const from = Math.max(1, parseInt(opt('from', '1'), 10) || 1)
const to = parseInt(opt('to', '999999'), 10) || 999999
const scale = parseFloat(opt('scale', '4')) || 4 // ~288dpi: Tesseract thích ~300dpi
const lang = opt('lang', 'eng')
const dpi = Math.round(72 * scale)

const scriptDir = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(opt('out', resolve(scriptDir, '..', 'ocr-output', basename(input).replace(/\.pdf$/i, ''))))
const cachePath = resolve(scriptDir, '.tesscache')
await mkdir(outDir, { recursive: true })
await mkdir(cachePath, { recursive: true })

// ---------- image helpers ----------
// PNG buffer → { gray (cho phân tích layout), w, h, src (canvas ảnh GỐC để crop OCR) }.
//   OCR chạy trên ảnh gốc (KHÔNG binarize) — Tesseract tự adaptive-threshold tốt hơn binarize cứng.
async function decodeGray(pngBuffer) {
  const img = await loadImage(pngBuffer)
  const w = img.width, h = img.height
  const src = createCanvas(w, h)
  const ctx = src.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, w, h)
  const gray = new Uint8Array(w * h)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
  }
  return { gray, w, h, src }
}
// Otsu threshold trên histogram gray.
function otsu(gray) {
  const hist = new Array(256).fill(0)
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++
  const total = gray.length
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0, wB = 0, maxVar = -1, thr = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (wB === 0) continue
    const wF = total - wB; if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB, mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > maxVar) { maxVar = between; thr = t }
  }
  return thr
}
// Phân tích layout: tách header (chữ vắt ngang giữa trang) + gutter (khe trắng giữa 2 cột).
function analyzeLayout(gray, w, h, thr) {
  const isInk = (x, y) => gray[y * w + x] < thr
  // 1) gutter: xét dải giữa theo chiều dọc (bỏ header ở trên & footer dưới để không nhiễu).
  const y0 = Math.floor(h * 0.30), y1 = Math.floor(h * 0.90), bandH = y1 - y0
  const colInk = new Float64Array(w)
  for (let x = 0; x < w; x++) {
    let c = 0
    for (let y = y0; y < y1; y++) if (isInk(x, y)) c++
    colInk[x] = c
  }
  // biên nội dung trái/phải
  const inkThresh = bandH * 0.02
  let cL = 0, cR = w - 1
  while (cL < w && colInk[cL] < inkThresh) cL++
  while (cR > 0 && colInk[cR] < inkThresh) cR--
  // tìm khe trắng rộng nhất trong 1/3 giữa của [cL,cR]
  const sL = Math.floor(cL + (cR - cL) * 0.33), sR = Math.floor(cL + (cR - cL) * 0.67)
  let bestRun = 0, bestCenter = -1, run = 0, runStart = sL
  for (let x = sL; x <= sR; x++) {
    if (colInk[x] < inkThresh) { if (run === 0) runStart = x; run++ }
    else { if (run > bestRun) { bestRun = run; bestCenter = Math.floor((runStart + x - 1) / 2) } run = 0 }
  }
  if (run > bestRun) { bestRun = run; bestCenter = Math.floor((runStart + sR) / 2) }
  const gutterX = bestRun >= Math.max(6, w * 0.008) ? bestCenter : null

  // 2) header: vùng trên nơi chữ VẮT NGANG gutter (nếu có gutter). Tìm y cuối cùng (trong 30% đầu) còn vắt ngang.
  let headerBottom = 0
  if (gutterX != null) {
    const gw = Math.max(4, Math.floor(w * 0.012))
    const rowCross = (y) => { let c = 0; for (let x = gutterX - gw; x <= gutterX + gw; x++) if (x >= 0 && x < w && isInk(x, y)) c++; return c > gw * 0.4 }
    const yHead = Math.floor(h * 0.30)
    for (let y = 0; y < yHead; y++) if (rowCross(y)) headerBottom = y
    if (headerBottom > 0) headerBottom = Math.min(h, headerBottom + Math.floor(h * 0.008))
    if (headerBottom < Math.floor(h * 0.02)) headerBottom = 0 // header quá nhỏ → bỏ
  }
  return { gutterX, headerBottom, contentLeft: cL, contentRight: cR }
}
// crop 1 vùng từ binarized canvas → PNG buffer (thêm lề trắng cho Tesseract dễ đọc).
function cropPng(srcCanvas, x, y, cw, ch, pad = 24) {
  cw = Math.max(1, Math.min(cw, srcCanvas.width - x))
  ch = Math.max(1, Math.min(ch, srcCanvas.height - y))
  const out = createCanvas(cw + pad * 2, ch + pad * 2)
  const ctx = out.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(srcCanvas, x, y, cw, ch, pad, pad, cw, ch)
  return out.toBuffer('image/png')
}

// ---------- cleanup ----------
const WATERMARKS = [/GROUP\s*[:.]?\s*ORIGINAL\s+EXAMS/i, /REAL\s+IELTS\s+EXAMS/i]
function cleanup(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/[ \t]+$/g, ''))
  const kept = []
  for (const l of lines) {
    if (WATERMARKS.some((re) => re.test(l))) continue
    const alnum = (l.match(/[A-Za-z0-9]/g) || []).length
    const nonSpace = l.replace(/\s/g, '').length
    if (nonSpace > 0 && alnum === 0 && nonSpace <= 3) continue // dòng rác toàn ký hiệu (|, {, ], ; …)
    if (nonSpace >= 1 && nonSpace <= 2 && alnum <= 1) continue // ký tự lẻ ở mép cột
    kept.push(l)
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ---------- OCR ----------
// Model: ưu tiên tessdata_best local (chính xác hơn model 'fast' mặc định của tesseract.js) nếu đã vendor.
const bestDir = resolve(scriptDir, '.tessdata_best')
const useBest = existsSync(resolve(bestDir, `${lang}.traineddata`))
console.log(`OCR: ${input}\npages ${from}..${to === 999999 ? 'end' : to} · scale ${scale} (~${dpi}dpi) · lang ${lang} · model ${useBest ? 'tessdata_best (local)' : 'default'}\nout:  ${outDir}`)
const worker = await createWorker(lang, 1, useBest ? { langPath: bestDir, cachePath: bestDir, gzip: false } : { cachePath })
async function ocr(buf, psm) {
  await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1', user_defined_dpi: String(dpi) })
  const { data } = await worker.recognize(buf)
  return { text: data.text || '', conf: typeof data.confidence === 'number' ? data.confidence : 0 }
}

const document = await pdf(resolve(input), { scale })
console.log(`total pages (pdfjs): ${document.length}`)
let pageNo = 0, totalChars = 0
const confs = []
const combined = []
for await (const png of document) {
  pageNo++
  if (pageNo < from) continue
  if (pageNo > to) break
  const t0 = Date.now()
  const { gray, w, h, src } = await decodeGray(png)
  const thr = otsu(gray)
  const { gutterX, headerBottom } = analyzeLayout(gray, w, h, thr)

  const regions = []
  if (gutterX != null) {
    if (headerBottom > 0) regions.push(['header', 0, 0, w, headerBottom, PSM.SINGLE_BLOCK])
    regions.push(['L', 0, headerBottom, gutterX, h - headerBottom, PSM.SINGLE_BLOCK])
    regions.push(['R', gutterX, headerBottom, w - gutterX, h - headerBottom, PSM.SINGLE_BLOCK])
  } else {
    regions.push(['full', 0, 0, w, h, PSM.SINGLE_COLUMN])
  }

  const parts = []
  let pageConfNum = 0, pageConfDen = 0
  for (const [, x, y, cw, ch, psm] of regions) {
    const r = await ocr(cropPng(src, x, y, cw, ch), psm)
    const t = r.text.trim()
    if (t) { parts.push(t); const n = t.length; pageConfNum += r.conf * n; pageConfDen += n }
  }
  const text = cleanup(parts.join('\n\n'))
  const conf = pageConfDen ? pageConfNum / pageConfDen : 0
  confs.push(conf)
  totalChars += text.length
  await writeFile(resolve(outDir, `page-${String(pageNo).padStart(3, '0')}.txt`), text, 'utf8')
  combined.push(`\n\n===== PAGE ${pageNo} =====\n\n${text}`)
  const layout = gutterX != null ? `2col@${gutterX}${headerBottom ? '+hdr' : ''}` : '1col'
  console.log(`  page ${pageNo}: ${text.length} chars · conf ${conf.toFixed(1)}% · ${layout} · ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}
await writeFile(resolve(outDir, '_combined.md'), combined.join('\n').trim() + '\n', 'utf8')
await worker.terminate()
const avg = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0
console.log(`DONE · ${totalChars} chars · avg conf ${avg.toFixed(1)}% → ${outDir}`)
