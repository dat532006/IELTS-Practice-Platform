# PDF importer — nạp đề từ PDF (self-hosted, offline, KHÔNG API)

Bộ tool nội bộ (content pipeline) trích **đề PDF → TEXT + ẢNH hình/map**. Chạy hoàn toàn local, **không gọi API, không cần API key**. Nằm ngoài runtime app (chỉ trong `scripts/`, không vào bundle Next.js).

> ⚠️ Đây là **hỗ trợ nhập liệu**, KHÔNG phải "upload là xong". Output là text thô cần người rà trước khi tạo đề.
> ⚠️ **TUYỆT ĐỐI không nhập `answer_keys` từ OCR/text thô** — trang đáp án OCR chỉ ~60–80%, key sai = chấm sai người trả tiền. Verify tay 100%.

## Chọn công cụ theo loại PDF

| PDF | Text | Hình/map/diagram |
|---|---|---|
| **Có text layer** (digital, vd đề Listening) | `extract-pdf.mjs` → **`pdftotext -layout`** (chuẩn, giữ cột bảng) | `export-pdf-image.mjs` (render vùng → PNG) |
| **Scan ảnh** (vd đề Reading) | `extract-pdf.mjs` → tự chuyển **OCR** (`ocr-pdf.mjs`: grid tái dựng + gỡ nhiễu) | OCR tự crop smudge/hình-đặc; line-art dùng `export-pdf-image.mjs` |

👉 **Luôn bắt đầu bằng `extract-pdf.mjs`** — nó tự nhận PDF có text layer hay scan để chọn đúng đường. Hình line-art (map/plan/flowchart) KHÔNG dò tự động được → export thủ công thành ảnh.

## Cài đặt

Deps đã nằm trong `devDependencies` (`pdf-to-img`, `tesseract.js`, `nspell`, `dictionary-en-gb`):

```bash
npm install
```

Tải model OCR chất lượng cao `tessdata_best` (một lần, ~15MB — **gitignored**, không commit):

```bash
mkdir -p scripts/.tessdata_best
curl -sL -o scripts/.tessdata_best/eng.traineddata \
  https://github.com/tesseract-ocr/tessdata_best/raw/main/eng.traineddata
```

Không có file này thì tool tự dùng model `fast` mặc định (kém chính xác hơn).

## Dùng

```bash
# 0) SMART: tự nhận text layer → pdftotext -layout; không thì tự OCR. LUÔN dùng cái này trước.
node scripts/extract-pdf.mjs "C:/path/to/Test 3.pdf"
#   [--from N] [--to N]   giới hạn trang — vd đề 12 trang, KEY ở trang 12 → --from 1 --to 11
#                         (BỎ trang key để NHẬP TAY; áp dụng cả text-layer lẫn OCR)
#   [--out DIR] [--force-ocr] [--raw] [--min-chars N]   (cờ khác chuyển tiếp cho ocr-pdf nếu phải OCR)

# 1) (chỉ khi scan) OCR trực tiếp: rasterize + PHÂN LOẠI VÙNG (prose / figure-noise / grid) + tessdata_best
node scripts/ocr-pdf.mjs "C:/path/to/AC_.pdf" --scale 4
#   [--from N] [--to N] [--out DIR] [--scale S] [--lang eng]
#   [--no-regions]        tắt phân loại vùng (chỉ prose như bản đầu)
#   [--fig-min-area F]    ngưỡng diện tích vùng nhiễu/hình (mặc định 0.02 = 2% trang)

# 2) Vá typo prose an toàn (precision-first; lỗi mập mờ để nguyên) — chỉ cho output OCR
node scripts/ocr-correct.mjs ocr-output/AC_

# 3) Export hình/map/diagram (line-art) ra PNG để chèn làm image asset
node scripts/export-pdf-image.mjs "C:/path/to/Test 3.pdf" --page 2 --box 0.10,0.27,0.88,0.68
#   --page N | --pages 2,3   [--scale S] [--box fx0,fy0,fx1,fy1 (tỉ lệ 0..1, 1 trang)] [--trim] [--pad P] [--out DIR]
```

Kết quả ở `ocr-output/<tên-pdf>/` (**gitignored**): `page-NNN.txt`, `_combined.md`, `page-NNN-fig-K.png` (vùng nhiễu/hình OCR cắt ra), `page-NNN-crop.png` (hình export thủ công), và bản `*.corrected.*` + `_corrections.log` (audit bước 2). Mỗi trang OCR có thêm mục **VÙNG CẤU TRÚC** liệt kê figure + grid tái dựng.

## Cách hoạt động

**`extract-pdf.mjs` (smart entry):** thử `pdftotext -enc UTF-8 -layout`; nếu TB ký tự/trang ≥ `--min-chars` (mặc định 80) ⇒ **có text layer** → ghi text pdftotext (giữ cột bảng, chỉ dọn dòng watermark). Ngược lại (≈0 ký tự = scan) ⇒ tự spawn `ocr-pdf.mjs`. `--force-ocr` để ép OCR.

**`export-pdf-image.mjs`:** render trang (pdf-to-img) → PNG; `--box` cắt theo tỉ lệ 0..1, `--trim` cắt sát lề trắng. Dùng cho map/plan/diagram line-art — thứ mà text/OCR không biểu diễn được (vị trí đồ hoạ LÀ nội dung).

**`ocr-pdf.mjs` (khi scan):**

- **Rasterize:** `pdf-to-img` (dùng `canvas`/skia prebuilt) render trang PDF → ảnh.
- **Layout:** projection profile phát hiện *gutter* (khe giữa 2 cột) + *header* (chữ vắt ngang) → OCR từng vùng đúng thứ tự đọc (Tesseract PSM `SINGLE_BLOCK`/`SINGLE_COLUMN`). Sửa triệt để lỗi cột trái/phải bị trộn.
- **Phân loại vùng (region classification):** một pass OCR toàn trang lấy toạ độ từ (word bbox) rồi tách:
  - **Vùng nhiễu / hình** (vệt mực scan, đám chấm, hình đặc): nhận bằng **mật độ mực** theo ô — text ≤~29%, smudge/hình-đặc ≥~40% (ngưỡng 0.35, thực đo). Cắt thành ảnh `page-NNN-fig-K.png`, **tô trắng khỏi prose** (hết rác) + để placeholder "⚠️ KIỂM TRA".
  - **Grid / danh sách A–G** (matching, list of words/people): **tái dựng cặp Chữ↔Từ bằng toạ độ** (gom marker theo hàng→cột, value = từ bên phải marker cùng hàng) — sửa lỗi OCR đọc bảng lộn thứ tự. Chỉ nhận word-list thật (value ngắn ≤4 từ TB); MC options (câu dài "A,B,C or D") tự loại. **KHÔNG mask** grid khỏi prose (bbox hay chồng câu hỏi xen kẽ → sẽ xoá nhầm) — chỉ APPEND bản tái dựng.
- **OCR:** `tesseract.js` (WASM, offline), model `eng` cache ở `scripts/.tesscache` → lần 2 offline hẳn. `scale 4` (~288dpi) là điểm tối ưu (scale 5 tệ hơn).
- **Correct:** `nspell` + `dictionary-en-gb` (British → không đổi *centre→center*). Chỉ sửa khi có **đúng 1 gợi ý** unambiguous; bỏ tên riêng/ALL-CAPS/contraction.

## Độ chính xác (thực đo trên 1 đề AC reading — 15 trang)

| Loại trang | Chất lượng |
|---|---|
| Passage prose | ~**97%** (thứ tự cột đúng, best-model) — đủ dùng sau rà nhẹ |
| Question / matching | ~84–92% |
| **Grid / danh sách A–G** | **tái dựng đúng** (vd trang 14: A–G ghép chuẩn) — vẫn **⚠️ VERIFY** vì feed vào chấm điểm |
| Vùng nhiễu/hình | cắt ra ảnh + gỡ khỏi prose (prose sạch hẳn, vd trang 14: conf 53%→89%) |
| **Answer-key / bảng số** | ~60–80% — **phải nhập/verify tay** |

Lỗi mập mờ (vd `cne`→one, `twe`→two) tool **để nguyên** thay vì đoán sai — cần ngữ cảnh (người rà).

**Hạn chế đã biết:** vùng nhiễu/hình (OCR) nhận theo **mật độ mực cao** ⇒ bắt tốt vệt scan/hình đặc; **hình nét mảnh** (flowchart/map line-art, mật độ thấp ~10% = giống text) **không** tự bắt được (đề Listening "Label the map" đã kiểm chứng: bị skip đúng như thiết kế để không nuốt chữ). Với loại này ⇒ dùng **`export-pdf-image.mjs`** chọn trang/vùng thủ công ra PNG.

## Ghi chú

- Artifacts (`ocr-output/`, `.tesscache/`, `.tessdata_best/`, `*-fig-*.png`) đều **gitignored**.
- Cấu trúc hoá text → `passages / questions / answer_keys` đúng schema `POST /api/admin/tests` là **bước riêng** (thủ công / parser), tool này không làm.
- Grid tái dựng & vùng nhiễu/hình đều gắn nhãn **⚠️ VERIFY/KIỂM TRA** — luôn cần người rà trước khi tạo đề.
