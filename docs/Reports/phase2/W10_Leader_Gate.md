# W10 Leader Gate

> **Date:** 2026-06-24 (independent re-review, ultracode/xhigh) · **Updated:** 2026-06-25 (Leader decision — gate opened)
> **Verdict:** **PASS — W11 ĐƯỢC MỞ.** (MVP4 Writing AI core đạt trên MOCK; F-B + F-C đã FIX; **F-A (live-AI) DEFERRED tới sau W15 theo quyết định Leader**, KHÔNG overclaim live.)
> **Tiền đề:** `W9_Leader_Gate.md` = CONDITIONAL PASS ("W10 được phép mở"; residual W9-R1/R2/R3 còn mở).
> **Liên kết:** `W10_Leader_Review.md` (đầy đủ findings), `W10_Backend_Report.md`, `W10_Frontend_Report.md`.

## Update 2026-06-25 — Leader decision (gate opened)

- **Quyết định:** Owner/Leader **chấp nhận defer F-A** (live AI provider test) **tới sau W15**. W10 chuyển từ CONDITIONAL → **PASS**, **W11 được mở**.
- **Cơ sở:** gate cũ đã nêu path hợp lệ ở "Required fixes #1": *"hoặc Owner chấp nhận mock + ghi roadmap-violation rõ"*. Đây là việc thực thi path đó.
- **Roadmap-violation ghi rõ (KHÔNG overclaim):** core AI grading **vẫn chỉ verify trên MOCK**; live Claude smoke **NOT RUN** (thiếu `ANTHROPIC_API_KEY`). **KHÔNG** được claim "AI grading production-verified" cho tới khi có key thật + live smoke (đóng F-A sau W15).
- **Carry-over bắt buộc cho W11:** giữ nguyên invariant AI key/system prompt/raw provider response/IP hash **không ra client**; AI output Zod-validate trước khi lưu; `overall_band` server-compute; rate limit (user + IP) atomic; writing result owner-guard.

> **Lịch sử:** verdict gốc 2026-06-24 = **CONDITIONAL — W11 KHÔNG mở** (chỉ còn F-A). Được superseded bởi quyết định Leader 2026-06-25 ở trên. Phần Evidence/Findings dưới giữ nguyên (vẫn chính xác); chỉ trạng thái F-A đổi OPEN → DEFERRED.

## Gate Summary
- **BE W10 (mock):** `POST /api/grade-writing` auth→owner→word-count→rate-limit(RPC atomic)→Claude/mock→**server overall_band**→persist `writing_submissions`. Zod-validate AI output trước khi lưu; band [0..9]/step .5; refusal/invalid→502 không lưu. Free 1/ngày + Pro bypass + refund. `ANTHROPIC_API_KEY` server-only.
- **FE W10:** `/writing/[id]` + `WritingRunner` 2 cột + word count realtime (150/250) + submit + result panel (band+overall server+công thức+mock disclaimer). Không import scoring.
- **Mâu thuẫn scope (đã đóng):** `api_contract §4` `GET /api/writing-result/[id]` + page — **IMPLEMENTED** (F-B RESOLVED).

## Evidence
- `npm run typecheck` **PASS** · `npm run build` **PASS** (`/api/grade-writing`, `/api/writing-result/[id]`, `/writing-result/[id]`, `/writing/[id]` = ƒ) · `npm run db:verify` **ALL PASSED** (check1–21 + RPC).
- `writing_grading_smoke.mjs` (MOCK) **35/35**: unauth 401 · word-count<min 400 · happy 200 (overall server-computed) · no secret leak · persisted · free 2nd 429 · Pro bypass 200 · cross-user 404 · client UPDATE/RPC denied · **writing-result owner 200 / cross-user 404 / unauth 401 (F-B)** · **reading attempt → grade-writing 404 + không finalize + không tạo submission (F-C)**.
- FE browser (desktop 1280×850 + mobile 385×812): word count realtime, overall 6.0 server, mock disclaimer, no leak, mobile no overflow, **0 console error**.
- **GAP (DEFERRED):** Live Claude smoke **NOT RUN** (no `ANTHROPIC_API_KEY`) — F-A deferred tới sau W15 theo quyết định Leader 2026-06-25.

## Findings (chi tiết ở Review §7)
- **P0:** none.
- **P1:** F-A — live AI grading chưa verify runtime (chỉ mock). **DEFERRED tới sau W15 (Leader decision 2026-06-25).** Không chặn W11.
- **P2:** ~~F-B `/api/writing-result/[id]` + page thiếu~~ → **RESOLVED**. ~~F-C grade-writing thiếu type guard~~ → **RESOLVED**.
- **P3 (còn):** F-E re-grade không cập nhật attempts.band · F-F status 502 ngoài convention · F-G draft không persist reload · F-H browser unauth-path chưa chụp · F-I reserve race/refund best-effort.
- **Info:** W10 mở trên W9 conditional; docs gitignored; no security regression; invariant #20 (không overclaim) **được tôn trọng** — gate PASS nhưng ghi rõ live-AI chưa verify.

## Required W11 Invariant (carry-over)
- AI key/system prompt/raw provider response/IP hash KHÔNG ra client; AI output Zod-validate trước khi lưu; overall server-compute (không tin AI); free rate limit + Pro bypass + IP/day limit; writing result owner-guard; **KHÔNG claim AI production verified nếu chỉ mock**.

## Known Gaps for W11+ (defer/nợ)
- **F-A (DEFERRED post-W15):** live-AI calibration + đóng F-A khi có `ANTHROPIC_API_KEY` thật + live smoke.
- W11 (M07 hardening): prompt caching (cache_read verify khi có key) + evaluation harness (cần Owner samples) + error highlights + IP rate limit.
- F-E/F-F/F-G/F-H/F-I (P3). W9 residual R1/R2/R3 (browser) vẫn nợ.

## Verdict
**PASS — W11 ĐƯỢC MỞ** (Leader decision 2026-06-25). Không P0, không security regression. F-B + F-C đã đóng (smoke 35/35 + browser). F-A (live-AI) **DEFERRED tới sau W15** với roadmap-violation ghi rõ: **AI grading mới verify trên MOCK, KHÔNG claim production-verified** cho tới khi có key thật + live smoke.
