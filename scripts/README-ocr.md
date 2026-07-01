# OCR importer — nạp đề từ PDF scan (self-hosted, offline, KHÔNG API)

Tool nội bộ (content pipeline) chuyển **PDF đề dạng scan ảnh → TEXT THÔ**. Chạy hoàn toàn local, **không gọi API, không cần API key**. Nằm ngoài runtime app (chỉ trong `scripts/`, không vào bundle Next.js).

> ⚠️ Đây là **hỗ trợ nhập liệu**, KHÔNG phải "upload là xong". Output là text thô cần người rà trước khi tạo đề.
> ⚠️ **TUYỆT ĐỐI không nhập `answer_keys` từ OCR thô** — trang đáp án OCR chỉ ~60–80%, key sai = chấm sai người trả tiền. Verify tay 100%.

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
# 1) OCR: rasterize + tách CỘT/HEADER (sửa lỗi 2 cột đọc trộn) + tessdata_best
node scripts/ocr-pdf.mjs "C:/path/to/AC_.pdf" --scale 4
#   [--from N] [--to N] [--out DIR] [--scale S] [--lang eng]

# 2) Vá typo prose an toàn (precision-first; lỗi mập mờ để nguyên)
node scripts/ocr-correct.mjs ocr-output/AC_
```

Kết quả ở `ocr-output/<tên-pdf>/` (**gitignored**): `page-NNN.txt`, `_combined.md`, và bản `*.corrected.*` + `_corrections.log` (audit mọi thay đổi của bước 2).

## Cách hoạt động

- **Rasterize:** `pdf-to-img` (dùng `canvas`/skia prebuilt) render trang PDF → ảnh.
- **Layout:** projection profile phát hiện *gutter* (khe giữa 2 cột) + *header* (chữ vắt ngang) → OCR từng vùng đúng thứ tự đọc (Tesseract PSM `SINGLE_BLOCK`/`SINGLE_COLUMN`). Sửa triệt để lỗi cột trái/phải bị trộn.
- **OCR:** `tesseract.js` (WASM, offline), model `eng` cache ở `scripts/.tesscache` → lần 2 offline hẳn. `scale 4` (~288dpi) là điểm tối ưu (scale 5 tệ hơn).
- **Correct:** `nspell` + `dictionary-en-gb` (British → không đổi *centre→center*). Chỉ sửa khi có **đúng 1 gợi ý** unambiguous; bỏ tên riêng/ALL-CAPS/contraction.

## Độ chính xác (thực đo trên 1 đề AC reading)

| Loại trang | Chất lượng |
|---|---|
| Passage prose | ~**97%** (thứ tự cột đúng, best-model) — đủ dùng sau rà nhẹ |
| Question / matching | ~84–90% |
| **Answer-key / bảng** | ~60–80% — **phải nhập/verify tay** |

Lỗi mập mờ (vd `cne`→one, `twe`→two) tool **để nguyên** thay vì đoán sai — cần ngữ cảnh (người rà).

## Ghi chú

- Artifacts (`ocr-output/`, `.tesscache/`, `.tessdata_best/`) đều **gitignored**.
- Cấu trúc hoá text → `passages / questions / answer_keys` đúng schema `POST /api/admin/tests` là **bước riêng** (thủ công / parser), tool này không làm.
