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
# 1) OCR: rasterize + PHÂN LOẠI VÙNG (prose / figure-noise / grid) + tessdata_best
node scripts/ocr-pdf.mjs "C:/path/to/AC_.pdf" --scale 4
#   [--from N] [--to N] [--out DIR] [--scale S] [--lang eng]
#   [--no-regions]        tắt phân loại vùng (chỉ prose như bản đầu)
#   [--fig-min-area F]    ngưỡng diện tích vùng nhiễu/hình (mặc định 0.02 = 2% trang)

# 2) Vá typo prose an toàn (precision-first; lỗi mập mờ để nguyên)
node scripts/ocr-correct.mjs ocr-output/AC_
```

Kết quả ở `ocr-output/<tên-pdf>/` (**gitignored**): `page-NNN.txt`, `_combined.md`, `page-NNN-fig-K.png` (vùng nhiễu/hình cắt ra), và bản `*.corrected.*` + `_corrections.log` (audit bước 2). Mỗi trang có thêm mục **VÙNG CẤU TRÚC** liệt kê figure + grid tái dựng.

## Cách hoạt động

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

**Hạn chế đã biết:** vùng nhiễu/hình nhận theo **mật độ mực cao** ⇒ bắt tốt vệt scan/hình đặc; **hình nét mảnh** (flowchart/map line-art, mật độ thấp) sẽ **không** tự bắt được — bộ đề đang thử **không chứa** loại này nên chưa hiệu chỉnh; nếu gặp cần mẫu thật để tinh chỉnh (hoặc cắt tay).

## Ghi chú

- Artifacts (`ocr-output/`, `.tesscache/`, `.tessdata_best/`, `*-fig-*.png`) đều **gitignored**.
- Cấu trúc hoá text → `passages / questions / answer_keys` đúng schema `POST /api/admin/tests` là **bước riêng** (thủ công / parser), tool này không làm.
- Grid tái dựng & vùng nhiễu/hình đều gắn nhãn **⚠️ VERIFY/KIỂM TRA** — luôn cần người rà trước khi tạo đề.
