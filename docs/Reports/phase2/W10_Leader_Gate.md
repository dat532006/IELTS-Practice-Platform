# W10 Leader Gate

> **Date:** 2026-06-24 (independent re-review, ultracode/xhigh)
> **Verdict:** **CONDITIONAL — W11 KHÔNG được mở.** (MVP4 Writing AI scaffold đạt trên MOCK; F-B + F-C đã FIX; **chỉ còn P1 F-A: live-AI chưa verify**.)
> **Update 2026-06-24 (post-fix):** F-C (test-type guard) + F-B (`/api/writing-result/[id]` + page) **RESOLVED**; smoke **35/35**; clean build 4 route ƒ.
> **Tiền đề:** `W9_Leader_Gate.md` = CONDITIONAL PASS ("W10 được phép mở"; residual W9-R1/R2/R3 còn mở).
> **Liên kết:** `W10_Leader_Review.md` (đầy đủ findings), `W10_Backend_Report.md`, `W10_Frontend_Report.md`.

## Gate Summary
- **BE W10 (mock):** `POST /api/grade-writing` auth→owner→word-count→rate-limit(RPC atomic)→Claude/mock→**server overall_band**→persist `writing_submissions`. Zod-validate AI output trước khi lưu; band [0..9]/step .5; refusal/invalid→502 không lưu. Free 1/ngày + Pro bypass + refund. `ANTHROPIC_API_KEY` server-only.
- **FE W10:** `/writing/[id]` + `WritingRunner` 2 cột + word count realtime (150/250) + submit + result panel (band+overall server+công thức+mock disclaimer). Không import scoring.
- **Mâu thuẫn scope:** `api_contract §4` định nghĩa `GET /api/writing-result/[id]` + page — **chưa implement** (F-B).

## Evidence
- `npm run typecheck` **PASS** · `npm run build` **PASS** (`/api/grade-writing`, `/api/writing-result/[id]`, `/writing-result/[id]`, `/writing/[id]` = ƒ) · `npm run db:verify` **ALL PASSED** (check1–21 + RPC).
- `writing_grading_smoke.mjs` (MOCK) **35/35**: unauth 401 · word-count<min 400 · happy 200 (overall server-computed) · no secret leak · persisted · free 2nd 429 · Pro bypass 200 · cross-user 404 · client UPDATE/RPC denied · **writing-result owner 200 / cross-user 404 / unauth 401 (F-B)** · **reading attempt → grade-writing 404 + không finalize + không tạo submission (F-C)**.
- FE browser: inline result (shared `WritingResultView`) + trang `/writing-result/[id]` render overall 6.0 server + mock disclaimer + no leak + 0 console error.
- FE browser (desktop 1280×850 + mobile 385×812): word count realtime, overall 6.0 server, mock disclaimer, no leak, mobile no overflow, **0 console error**.
- **GAP:** Live Claude smoke **NOT RUN** (no `ANTHROPIC_API_KEY`) — core deliverable chưa verify runtime (F-A, P1).

## Findings (chi tiết ở Review §7)
- **P0:** none.
- **P1:** F-A — live AI grading chưa verify runtime (chỉ mock). **CÒN MỞ.**
- **P2:** ~~F-B `/api/writing-result/[id]` + page thiếu~~ → **RESOLVED** (route + page + `WritingResultView` + smoke F-B 3 ca). ~~F-C grade-writing thiếu type guard~~ → **RESOLVED** (guard `test.type==='writing'` + smoke F-C 3 ca).
- **P3 (còn):** F-E re-grade không cập nhật attempts.band · F-F status 502 ngoài convention · F-G draft không persist reload · F-H browser unauth-path chưa chụp · F-I reserve race/refund best-effort.
- **Info:** W10 mở trên W9 conditional; docs gitignored; no security regression; invariant #20 (không overclaim) được tôn trọng.

## Required fixes before W11
1. **F-A (P1) — DUY NHẤT còn lại:** live-verify AI bằng `ANTHROPIC_API_KEY` thật (hoặc Owner chấp nhận mock + ghi roadmap-violation rõ).
2. ~~F-C~~ ✅ DONE · ~~F-B~~ ✅ DONE.
3. (Nên, không chặn) F-E, F-F.

## Required W11 Invariant (carry-over khi đủ điều kiện mở)
- AI key/system prompt KHÔNG ra client; AI output Zod-validate trước khi lưu; overall server-compute (không tin AI); free rate limit + Pro bypass; writing result owner-guard; KHÔNG claim AI production verified nếu chỉ mock.

## Known Gaps for W11+
- W11 (M07 hardening): prompt caching + evaluation log + output robustness + **live-AI calibration** (đóng F-A).
- F-B writing-result page (hoặc M09), F-E/F-F/F-G/F-H/F-I.
- W9 residual R1/R2/R3 (browser) vẫn nợ.
- KHÔNG claim AI grading production verified tới khi có key thật + live smoke.

## Verdict
**CONDITIONAL — W11 KHÔNG mở.** Không P0, không security regression, không overclaim. F-B + F-C đã đóng (smoke 35/35 + browser). **Chỉ còn 1 blocker P1: F-A (live-AI chưa verify, thiếu `ANTHROPIC_API_KEY`).** Đóng F-A (live smoke) → mới đủ điều kiện mở W11.
