#!/usr/bin/env node
// ============================================================
// Offline OCR cho PDF đề SCAN (self-hosted, KHÔNG API, KHÔNG cần key).
//   pdf-to-img render trang → PHÂN LOẠI VÙNG (region classification) → xử lý riêng từng loại:
//     • PROSE  : tách CỘT + HEADER (projection profile) → OCR đúng thứ tự đọc (tesseract.js WASM).
//     • FIGURE : diagram/flowchart/map (mực nhiều + nét dài, chữ đọc được rất ít) → KHÔNG OCR ra rác;
//                CROP thành ảnh PNG riêng + để placeholder trong text (chèn ảnh khi tạo đề).
//     • GRID   : danh sách A–G / bảng ghép → TÁI DỰNG bằng toạ độ từ (bbox) — sửa lỗi ghép cặp lộn.
//   Vùng FIGURE/GRID được tô trắng trước khi OCR prose ⇒ prose sạch, không lẫn rác.
//
//   Output = TEXT THÔ theo trang (page-NNN.txt) + _combined.md + ảnh page-NNN-fig-K.png.
//   KHÔNG cấu trúc hoá thành passages/questions/answer_keys (bước riêng).
//   ⚠️ GRID tái dựng & answer_keys PHẢI người verify — sai key = chấm sai người trả tiền.
//
// Usage: node scripts/ocr-pdf.mjs <input.pdf>
//        [--from N] [--to N] [--out DIR] [--scale S] [--lang eng]
//        [--no-regions]           tắt phân loại vùng (chỉ prose như bản cũ)
//        [--fig-min-area F]        ngưỡng diện tích figure (phần trăm trang, mặc định 0.02)
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
  console.error('Usage: node scripts/ocr-pdf.mjs <input.pdf> [--from N --to N --out DIR --scale S --lang eng --no-regions --fig-min-area F]')
  process.exit(1)
}
const input = args[0]
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d }
const has = (n) => args.includes(`--${n}`)
const from = Math.max(1, parseInt(opt('from', '1'), 10) || 1)
const to = parseInt(opt('to', '999999'), 10) || 999999
const scale = parseFloat(opt('scale', '4')) || 4 // ~288dpi: Tesseract thích ~300dpi
const lang = opt('lang', 'eng')
const dpi = Math.round(72 * scale)
const REGIONS = !has('no-regions') // phân loại vùng (figure/grid) BẬT mặc định
const FIG_MIN_AREA = Math.max(0.005, parseFloat(opt('fig-min-area', '0.02')) || 0.02)

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
// crop 1 vùng → PNG buffer (thêm lề trắng cho Tesseract dễ đọc).
function cropPng(srcCanvas, x, y, cw, ch, pad = 24) {
  cw = Math.max(1, Math.min(cw, srcCanvas.width - x))
  ch = Math.max(1, Math.min(ch, srcCanvas.height - y))
  const out = createCanvas(cw + pad * 2, ch + pad * 2)
  const ctx = out.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(srcCanvas, x, y, cw, ch, pad, pad, cw, ch)
  return out.toBuffer('image/png')
}
// bản sao của src có các rect tô trắng (che figure/grid trước khi OCR prose).
function maskWhite(srcCanvas, rects) {
  const out = createCanvas(srcCanvas.width, srcCanvas.height)
  const ctx = out.getContext('2d')
  ctx.drawImage(srcCanvas, 0, 0)
  ctx.fillStyle = '#fff'
  for (const r of rects) ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)
  return out
}

// ---------- region classification ----------
// VÙNG NHIỄU/HÌNH: vùng KHÔNG-PHẢI-TEXT (vệt mực scan, đám chấm, hình đặc) ⇒ không OCR ra rác;
//   crop thành ảnh riêng + tô trắng khỏi prose. Người kiểm tra quyết định giữ (nếu là hình thật) hay bỏ.
//   Phân biệt bằng MẬT ĐỘ MỰC theo ô (conf KHÔNG dùng được: smudge bị Tesseract gán conf cao):
//     • prose (kể cả heading/bảng chữ): mật độ mực mỗi ô ~15–28% (glyph + nhiều khoảng trắng).
//     • smudge / scan-noise / hình đặc : mật độ RẤT CAO (thực đo 40–81%).
//   ⇒ ngưỡng 0.35 tách sạch (đo trên đề thật: text ≤~29%, smudge ≥~40%).
//   HẠN CHẾ ĐÃ BIẾT: hình NÉT MẢNH (flowchart/map line-art, mật độ thấp) sẽ KHÔNG tự bắt được —
//     bộ đề đang có KHÔNG chứa hình loại này nên chưa hiệu chỉnh; nếu gặp, cần mẫu thật để tinh chỉnh.
function detectFigures(gray, w, h, thr) {
  const cs = Math.max(12, Math.round(w / 64)) // cạnh ô
  const C = Math.ceil(w / cs), R = Math.ceil(h / cs)
  const ink = new Float32Array(C * R)     // số pixel mực mỗi ô
  for (let y = 0; y < h; y++) {
    const ry = (y / cs) | 0
    for (let x = 0; x < w; x++) if (gray[y * w + x] < thr) ink[ry * C + ((x / cs) | 0)]++
  }
  const cellPx = cs * cs
  const DENS_FIG = 0.35 // ngưỡng mật độ tách smudge/hình-đặc khỏi text
  const cand = new Uint8Array(C * R)
  for (let i = 0; i < C * R; i++) if (ink[i] / cellPx > 0.06) cand[i] = 1 // ô có mực (để gộp cụm)
  // flood-fill cụm
  const seen = new Uint8Array(C * R), figures = []
  for (let i = 0; i < C * R; i++) {
    if (!cand[i] || seen[i]) continue
    const stack = [i]; seen[i] = 1
    let minc = C, maxc = 0, minr = R, maxr = 0, n = 0, inkSum = 0
    while (stack.length) {
      const cur = stack.pop(); n++; inkSum += ink[cur]
      const cr = (cur / C) | 0, cc = cur % C
      if (cc < minc) minc = cc; if (cc > maxc) maxc = cc
      if (cr < minr) minr = cr; if (cr > maxr) maxr = cr
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = cr + dr, nc = cc + dc
        if (nr < 0 || nc < 0 || nr >= R || nc >= C) continue
        const ni = nr * C + nc
        if (cand[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni) }
      }
    }
    const x0 = minc * cs, y0 = minr * cs, x1 = Math.min(w, (maxc + 1) * cs), y1 = Math.min(h, (maxr + 1) * cs)
    const bw = x1 - x0, bh = y1 - y0
    const meanDens = inkSum / (n * cellPx)
    if (process.env.OCR_DEBUG) console.error(`  [fig?] cells=${n} bbox=(${x0},${y0})-(${x1},${y1}) bw=${(bw / w * 100).toFixed(0)}%w bh=${(bh / h * 100).toFixed(0)}%h area=${(bw * bh / (w * h) * 100).toFixed(1)}% dens=${(meanDens * 100).toFixed(1)}% → ${(bw >= w * 0.12 && bh >= h * 0.05 && bw * bh >= FIG_MIN_AREA * w * h && meanDens > DENS_FIG) ? 'FIG' : 'skip'}`)
    if (bw < w * 0.12 || bh < h * 0.05) continue          // quá nhỏ / thanh mảnh → bỏ
    if (bw * bh < FIG_MIN_AREA * w * h) continue           // dưới ngưỡng diện tích
    if (meanDens <= DENS_FIG) continue                     // mật độ giống text → giữ làm prose
    figures.push({ x0, y0, x1, y1 })
  }
  return figures.sort((a, b) => a.y0 - b.y0)
}

// GRID: danh sách A–G / bảng ghép. Tái dựng cặp Chữ↔Từ bằng TOẠ ĐỘ (không theo dòng text OCR đã lộn).
//   Marker = token đúng 1 chữ A–G. Gom marker theo HÀNG (y), trong hàng theo CỘT (x).
//   Value của marker = các từ CÙNG HÀNG, nằm BÊN PHẢI marker, TRƯỚC marker kế tiếp trong hàng.
function reconstructGrid(words, w, h) {
  const isMarker = (t) => /^[A-G]$/.test(t)
  const markers = words.filter((x) => isMarker(x.text) && x.conf > 25)
  const letters = new Set(markers.map((m) => m.text))
  if (letters.size < 4) return null // cần ≥4 chữ A–G khác nhau (giảm dương-giả)
  const cy = (b) => (b.bbox.y0 + b.bbox.y1) / 2, cx = (b) => (b.bbox.x0 + b.bbox.x1) / 2
  const heights = words.map((x) => x.bbox.y1 - x.bbox.y0).filter((v) => v > 0).sort((a, b) => a - b)
  const medH = heights[Math.floor(heights.length / 2)] || 20
  const rowTol = medH * 0.9
  // marker vertical span quá lớn (rải khắp trang) → không phải 1 khối grid
  const mys = markers.map(cy)
  if (Math.max(...mys) - Math.min(...mys) > h * 0.55) return null
  // gom marker thành hàng
  const sorted = markers.slice().sort((a, b) => cy(a) - cy(b) || cx(a) - cx(b))
  const rows = []
  for (const m of sorted) {
    let row = rows.find((r) => Math.abs(r.y - cy(m)) < rowTol * 1.5)
    if (!row) { row = { y: cy(m), items: [] }; rows.push(row) }
    row.items.push(m); row.y = row.items.reduce((s, it) => s + cy(it), 0) / row.items.length
  }
  const valueWords = words.filter((x) => !isMarker(x.text) && x.conf > 20)
  let X0 = 1e9, Y0 = 1e9, X1 = 0, Y1 = 0
  const map = new Map()
  for (const row of rows) {
    const ms = row.items.slice().sort((a, b) => cx(a) - cx(b))
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]
      const rightBound = i + 1 < ms.length ? ms[i + 1].bbox.x0 : w
      const vs = valueWords.filter((v) => Math.abs(cy(v) - row.y) < rowTol * 1.2 && v.bbox.x0 >= m.bbox.x1 - medH * 0.4 && cx(v) < rightBound)
        .sort((a, b) => a.bbox.x0 - b.bbox.x0)
      const val = vs.map((v) => v.text).join(' ').replace(/\s+/g, ' ').trim()
      if (!map.has(m.text) || (!map.get(m.text) && val)) map.set(m.text, val)
      for (const bb of [m, ...vs]) {
        X0 = Math.min(X0, bb.bbox.x0); Y0 = Math.min(Y0, bb.bbox.y0)
        X1 = Math.max(X1, bb.bbox.x1); Y1 = Math.max(Y1, bb.bbox.y1)
      }
    }
  }
  // gate: word-list thật (people/word) có VALUE NGẮN. MC options (A,B,C or D) là CÂU dài
  //   → loại (tái dựng sẽ sai, vd "C = or D." từ câu lệnh "Choose … A, B, C or D").
  const vals = [...map.values()].filter(Boolean)
  if (vals.length < 3) return null
  const wc = (v) => v.split(/\s+/).filter(Boolean).length
  const avgWords = vals.reduce((s, v) => s + wc(v), 0) / vals.length
  const maxWords = vals.reduce((m, v) => Math.max(m, wc(v)), 0)
  if (avgWords > 4 || maxWords >= 7) return null
  const lines = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([L, v]) => `${L} = ${v || '???'}`)
  return { lines, bbox: { x0: X0, y0: Y0, x1: X1, y1: Y1 } }
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
console.log(`OCR: ${input}\npages ${from}..${to === 999999 ? 'end' : to} · scale ${scale} (~${dpi}dpi) · lang ${lang} · model ${useBest ? 'tessdata_best (local)' : 'default'} · regions ${REGIONS ? 'on' : 'off'}\nout:  ${outDir}`)
const worker = await createWorker(lang, 1, useBest ? { langPath: bestDir, cachePath: bestDir, gzip: false } : { cachePath })
async function ocr(buf, psm) {
  await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1', user_defined_dpi: String(dpi) })
  const { data } = await worker.recognize(buf)
  return { text: data.text || '', conf: typeof data.confidence === 'number' ? data.confidence : 0 }
}
// detect-pass: OCR toàn trang lấy TỪ + toạ độ (page coords) — dùng để tìm figure & tái dựng grid.
async function ocrWords(srcCanvas) {
  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1', user_defined_dpi: String(dpi) })
  const { data } = await worker.recognize(srcCanvas.toBuffer('image/png'), {}, { blocks: true })
  const words = []
  for (const wd of data.words || []) if (wd && wd.text && wd.bbox) words.push({ text: wd.text, bbox: wd.bbox, conf: typeof wd.confidence === 'number' ? wd.confidence : 0 })
  return words
}

const document = await pdf(resolve(input), { scale })
console.log(`total pages (pdfjs): ${document.length}`)
let pageNo = 0, totalChars = 0, totalFigs = 0, totalGrids = 0
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

  // --- phân loại vùng (figure + grid) ---
  let figures = [], grid = null
  if (REGIONS) {
    const words = await ocrWords(src)
    figures = detectFigures(gray, w, h, thr)
    grid = reconstructGrid(words, w, h)
  }
  // Chỉ tô trắng FIGURE/NHIỄU trước khi OCR prose. KHÔNG mask grid: bbox grid hay chồng lên prose
  //   xen kẽ (2 cột / danh sách người bên phải / MC options) ⇒ mask sẽ XOÁ MẤT câu hỏi. Grid chỉ
  //   được APPEND như phần tái dựng bổ sung (prose vẫn giữ bản thô — dư thừa vô hại).
  const proseSrc = figures.length ? maskWhite(src, figures) : src

  // --- OCR prose (giữ pipeline cột/header đã kiểm chứng) ---
  const regions = []
  if (gutterX != null) {
    if (headerBottom > 0) regions.push([0, 0, w, headerBottom, PSM.SINGLE_BLOCK])
    regions.push([0, headerBottom, gutterX, h - headerBottom, PSM.SINGLE_BLOCK])
    regions.push([gutterX, headerBottom, w - gutterX, h - headerBottom, PSM.SINGLE_BLOCK])
  } else {
    regions.push([0, 0, w, h, PSM.SINGLE_COLUMN])
  }
  const parts = []
  let pageConfNum = 0, pageConfDen = 0
  for (const [x, y, cw, ch, psm] of regions) {
    const r = await ocr(cropPng(proseSrc, x, y, cw, ch), psm)
    const t = r.text.trim()
    if (t) { parts.push(t); const n = t.length; pageConfNum += r.conf * n; pageConfDen += n }
  }
  let text = cleanup(parts.join('\n\n'))

  // --- ghép vùng cấu trúc vào output ---
  const structured = []
  for (let k = 0; k < figures.length; k++) {
    const f = figures[k]
    const name = `page-${String(pageNo).padStart(3, '0')}-fig-${k + 1}.png`
    await writeFile(resolve(outDir, name), cropPng(src, f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0, 0))
    structured.push(`[VÙNG NHIỄU/HÌNH ${k + 1} → ${name}]  (mật độ mực cao, đã tách khỏi text · ⚠️ KIỂM TRA: smudge scan thì BỎ, hình thật thì chèn ảnh)`)
  }
  if (grid) structured.push(`[DANH SÁCH A–G — tái dựng từ toạ độ · ⚠️ VERIFY]\n${grid.lines.join('\n')}`)
  if (structured.length) text = `${text}\n\n────────── VÙNG CẤU TRÚC (tách khỏi prose) ──────────\n${structured.join('\n\n')}`

  const conf = pageConfDen ? pageConfNum / pageConfDen : 0
  confs.push(conf); totalChars += text.length; totalFigs += figures.length; totalGrids += grid ? 1 : 0
  await writeFile(resolve(outDir, `page-${String(pageNo).padStart(3, '0')}.txt`), text, 'utf8')
  combined.push(`\n\n===== PAGE ${pageNo} =====\n\n${text}`)
  const layout = gutterX != null ? `2col@${gutterX}${headerBottom ? '+hdr' : ''}` : '1col'
  const rtag = REGIONS ? ` · fig ${figures.length}${grid ? ' · grid✓' : ''}` : ''
  console.log(`  page ${pageNo}: ${text.length} chars · conf ${conf.toFixed(1)}% · ${layout}${rtag} · ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}
await writeFile(resolve(outDir, '_combined.md'), combined.join('\n').trim() + '\n', 'utf8')
await worker.terminate()
const avg = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0
console.log(`DONE · ${totalChars} chars · ${totalFigs} figure · ${totalGrids} grid · avg conf ${avg.toFixed(1)}% → ${outDir}`)
