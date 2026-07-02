#!/usr/bin/env node
// ============================================================
// Render trang PDF → ẢNH PNG để CHÈN LÀM IMAGE ASSET (map / plan / diagram / flowchart line-art).
//   Dùng khi hình KHÔNG thể OCR/tái dựng thành text (vị trí đồ hoạ LÀ nội dung câu hỏi, vd "Label the map").
//   Offline, KHÔNG API (pdf-to-img + canvas). Không tự dò được line-art ⇒ chọn trang/vùng THỦ CÔNG.
//
// Usage: node scripts/export-pdf-image.mjs <input.pdf> --page N | --pages 2,3,5
//        [--scale S]                độ nét (mặc định 3 ≈ 216dpi; tăng nếu cần sắc hơn)
//        [--box fx0,fy0,fx1,fy1]    cắt vùng theo TỈ LỆ 0..1 (vd 0.12,0.28,0.62,0.66) — chỉ 1 trang
//        [--trim]                   tự cắt sát lề trắng quanh phần có mực
//        [--pad P]                  lề trắng thêm khi --box/--trim (px, mặc định 20)
//        [--out DIR]                thư mục ra (mặc định ocr-output/<tên-pdf>/)
// ============================================================
import { pdf } from 'pdf-to-img'
import { createCanvas, loadImage } from 'canvas'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
if (!args[0] || args[0].startsWith('--')) {
  console.error('Usage: node scripts/export-pdf-image.mjs <input.pdf> --page N | --pages 2,3 [--scale S] [--box fx0,fy0,fx1,fy1] [--trim] [--pad P] [--out DIR]')
  process.exit(1)
}
const input = args[0]
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d }
const has = (n) => args.includes(`--${n}`)
const scale = parseFloat(opt('scale', '3')) || 3
const pad = Math.max(0, parseInt(opt('pad', '20'), 10) || 20)
const trim = has('trim')
const boxStr = opt('box', '')
const box = boxStr ? boxStr.split(',').map(Number) : null
if (box && (box.length !== 4 || box.some((v) => Number.isNaN(v)))) { console.error('--box cần 4 số tỉ lệ 0..1: fx0,fy0,fx1,fy1'); process.exit(1) }

const pageArg = opt('page', '') || opt('pages', '')
if (!pageArg) { console.error('Cần --page N hoặc --pages 2,3,5'); process.exit(1) }
const wanted = new Set(pageArg.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0))
const maxPage = Math.max(...wanted)
if (box && wanted.size > 1) { console.error('--box chỉ dùng với 1 trang'); process.exit(1) }

const scriptDir = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(opt('out', resolve(scriptDir, '..', 'ocr-output', basename(input).replace(/\.pdf$/i, ''))))
await mkdir(outDir, { recursive: true })

// bbox phần có mực (để --trim): quét pixel < thr.
function inkBBox(canvas, thr = 205) {
  const { width: w, height: h } = canvas
  const { data } = canvas.getContext('2d').getImageData(0, 0, w, h)
  let x0 = w, y0 = h, x1 = 0, y1 = 0, found = false
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    const g = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
    if (g < thr) { found = true; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  return found ? { x0, y0, x1, y1 } : null
}

console.log(`export-image: ${input}\npages {${[...wanted].sort((a, b) => a - b).join(',')}} · scale ${scale}${box ? ` · box ${boxStr}` : ''}${trim ? ' · trim' : ''}\nout: ${outDir}`)
const document = await pdf(resolve(input), { scale })
let pageNo = 0, saved = 0
for await (const png of document) {
  pageNo++
  if (pageNo > maxPage) break
  if (!wanted.has(pageNo)) continue
  const img = await loadImage(png)
  let W = img.width, H = img.height
  let full = createCanvas(W, H)
  full.getContext('2d').drawImage(img, 0, 0)

  // vùng cần lấy (mặc định cả trang)
  let rx0 = 0, ry0 = 0, rx1 = W, ry1 = H
  if (box) { rx0 = Math.round(box[0] * W); ry0 = Math.round(box[1] * H); rx1 = Math.round(box[2] * W); ry1 = Math.round(box[3] * H) }
  // cắt vùng
  let cw = Math.max(1, rx1 - rx0), ch = Math.max(1, ry1 - ry0)
  let region = createCanvas(cw, ch)
  region.getContext('2d').drawImage(full, rx0, ry0, cw, ch, 0, 0, cw, ch)

  if (trim) {
    const bb = inkBBox(region)
    if (bb) {
      const tx0 = Math.max(0, bb.x0 - pad), ty0 = Math.max(0, bb.y0 - pad)
      const tx1 = Math.min(region.width, bb.x1 + pad), ty1 = Math.min(region.height, bb.y1 + pad)
      const tw = tx1 - tx0, th = ty1 - ty0
      const trimmed = createCanvas(tw, th)
      const ctx = trimmed.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, tw, th)
      ctx.drawImage(region, tx0, ty0, tw, th, 0, 0, tw, th)
      region = trimmed
    }
  } else if (box) {
    // thêm lề trắng cho vùng box
    const padded = createCanvas(region.width + pad * 2, region.height + pad * 2)
    const ctx = padded.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, padded.width, padded.height)
    ctx.drawImage(region, pad, pad)
    region = padded
  }

  const tag = box || trim ? '-crop' : ''
  const name = `page-${String(pageNo).padStart(3, '0')}${tag}.png`
  await writeFile(resolve(outDir, name), region.toBuffer('image/png'))
  console.log(`  page ${pageNo}: ${region.width}x${region.height} → ${name}`)
  saved++
}
console.log(`DONE · ${saved} ảnh → ${outDir}`)
