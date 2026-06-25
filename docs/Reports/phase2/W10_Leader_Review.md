# W10 Leader Review — Writing Submission & AI Grading (MVP4)

> **Phase:** 2 — MVP Exam & Writing
> **Week:** W10 · **Role:** Leader (independent gate-review, ultracode/xhigh)
> **Date:** 2026-06-24
> **Scope review:** BackendEngineer + FrontendEngineer W10 (M07). 3 role only.
> **Verdict:** **CONDITIONAL** — W11 KHÔNG được mở.

> ⚠️ Review độc lập: đối chiếu code/test/contract thực tế, KHÔNG tin report. Reviewer cũng là người implement → cố ý soi kỹ, tìm cả lỗi đã bỏ sót khi code.

> **POST-FIX UPDATE (2026-06-24):** đã FIX **F-C** (test-type guard trong `lib/exam/writing.ts`) và **F-B** (`GET /api/writing-result/[id]` + trang `/writing-result/[id]` + `WritingResultView` dùng chung) theo api_contract §4. Re-verify: typecheck/build PASS (4 route ƒ), `writing_grading_smoke` **35/35** (thêm 6 ca F-B/F-C), browser inline+page PASS 0 console error. **Còn lại P1 F-A (live-AI chưa verify) — verdict giữ CONDITIONAL, W11 chưa mở.** Findings F-B/F-C ở §7 nay = RESOLVED.

## 0. Documents Read
- Core: `api_contract.md` (§4 Writing AI — quan trọng), `security_rls_contract` (migration RLS), `database_schema`, `MasterRoadMap`, `M07_WritingAIGrading.md`, claude-api skill.
- Progress: `W6_to_W9_Project_Progress_Report.md`, `W9_Leader_Gate.md`, `W9_Leader_Review.md`.
- TaskBrief W10: BackendEngineer/phase2/w10.md, FrontendEngineer/phase2/w10.md, Leader/phase2/w10.md (đủ 3 role).
- Contracts W10: BE `w10_writing_grading_contract.md`, FE `w10_writing_ui_contract.md` (đủ). *(Leader contract không có — không bắt buộc; role Leader = gate, không có ContractForAI/Leader trong repo.)*
- Reports: `W10_Backend_Report.md`, `W10_Frontend_Report.md` (đủ).
- **Missing Evidence:** không đọc lại toàn bộ core protocol (Guideline/VibeCode/Conventions…) trong phiên này — đã nắm từ các tuần trước; không phát hiện mâu thuẫn mới.

## 1. W9 Gate Recheck
- `W9_Leader_Gate.md` = **CONDITIONAL PASS**, verdict ghi rõ "**W10 được phép mở**" + 3 residual browser non-blocking (W9-R1 listening switch, W9-R2 highlight paint, W9-R3 matrix fixture) chưa đóng.
- → W10 mở **hợp lệ** (W9 gate cho phép). Nhưng **roadmap caveat:** W10 build trên một W9 *conditional* còn residual mở (Info-K). Không phải violation cứng, nhưng W9-R1/R2/R3 vẫn nợ.

## 2. W10 Scope From TaskBrief
| Role | TaskBrief | Scope giao | Out of scope | Contract | Report |
|---|---|---|---|---|---|
| Backend | `BackendEngineer/phase2/w10.md` | Contract; `/api/grade-writing`; Zod-validate AI output; overall server (1/3·2/3 round .5); rate limit free 1/ngày qua `ai_grade_usage`; smoke (formula/invalid/unauth/rate-limit/no-leak) | UI; prompt caching/eval (W11) | ✅ Draft | ✅ |
| Frontend | `FrontendEngineer/phase2/w10.md` | Contract; layout 2 cột; word count 150/250; submit→`/api/grade-writing`; hiển thị band+overall+công thức; no client score | history/dashboard (M09) | ✅ Draft | ✅ |
| Leader | `Leader/phase2/w10.md` | Gate check; approve contracts; formula/validation review; AI/rate-limit/security review; viết Review/Gate | code feature | — (gate role) | ✅ (file này) |

**W10 expected scope:** Backend = Writing AI grading route (M07). Frontend = Writing UI + word count + result hiển thị inline. Leader = gate.
**Scope mismatch phát hiện:** `api_contract.md §4` định nghĩa thêm **`GET /api/writing-result/[id]` + trang `/writing-result/[id]`** (owner-guard, đọc `writing_submissions`) — **KHÔNG nằm trong TaskBrief W10** và **KHÔNG được implement** (xem F-B). Đây là gap giữa architecture contract và TaskBrief.

## 3. Backend Review

### 3.1 Requirement vs implementation
| Requirement (TaskBrief) | Implemented? | Evidence | Gap |
|---|---|---|---|
| Contract trước code | ✅ | `w10_writing_grading_contract.md` | — |
| `/api/grade-writing` server-side | ✅ | `app/api/grade-writing/route.ts` + `lib/exam/writing.ts` | — |
| Zod-validate AI output trước khi lưu | ✅ | `lib/ai/writing-grader.ts` `AiGradeSchema`+`bandsValid`; fail→502 | — |
| overall server (1/3·2/3 round .5), không tin AI | ✅ | `lib/scoring/writing-band.ts`; smoke overall==compute | — |
| Rate limit free 1/ngày, Pro bypass | ✅ | RPC `reserve_ai_grade`; smoke free2nd→429, Pro→200 | — |
| Test formula/invalid/unauth/rate-limit/no-leak | ◐ | `writing_grading_smoke` 23/23 (mock) | **Live Claude path KHÔNG test (F-A)**; invalid-AI-output không test runtime (mock luôn valid) |

### 3.2 API review
| API | Guard | Validation | Sensitive fields | Race/idempotency | Verdict |
|---|---|---|---|---|---|
| `POST /api/grade-writing` | auth 401 + owner 404 ✅ | Zod body (uuid + text 1..20000) ✅ | KHÔNG lộ key/system prompt ✅ (smoke) | rate-limit reserve atomic (RPC) ✅; re-grade delete+insert ✅; **không guard test.type (F-C)**; concurrent reserve race nhẹ (F-I) | ◐ |

- Status codes: 401/400/404/429/**502**/500. **502 ngoài tập convention** (api_contract ví dụ chỉ 4xx; review chuẩn 400/401/403/404/409/500) → F-F.
- Envelope chuẩn (`ok`/`fail`), error_code có. ✅

### 3.3 DB/RLS/migration
- Migration `20260604000100_ai_grade_usage_rpc.sql`: order đúng (sau core), idempotent (`create or replace`), rollback note có, `security definer` + `set search_path=public` (chống injection), **revoke execute từ public/anon/authenticated** (client deny — smoke xác nhận). KHÔNG thêm table (writing_submissions/ai_grade_usage có sẵn W1+2). ✅
- `db:verify` ALL PASSED (check1–21 + RPC apply). ✅
- ⚠️ Info-N: `revoke all on function from public` có thể ảnh hưởng service_role nếu service_role chỉ execute qua PUBLIC — nhưng smoke (service_role gọi RPC qua route, free2nd→429) chứng minh **service_role vẫn execute được** → OK empirically.

### 3.4 AI grading review
- API key server-only (`'server-only'`, `new Anthropic()` đọc env; không client import — grep `components` = 0). ✅
- System prompt không lộ client (smoke). ✅
- AI output Zod-validate + band range/step trước khi lưu; refusal/invalid→502 không lưu. ✅
- Fallback: thiếu key→mock deterministic; provider lỗi→catch→502 (+refund). ✅
- KHÔNG lưu raw provider response (chỉ lưu grade đã validate + mock flag). ✅
- ⚠️ **F-A (P1):** path LIVE (SDK tool-use call + parse) **CHƯA chạy runtime** (no key) → core deliverable AI grading chưa verify thật. Mock không chứng minh Claude integration hoạt động.

### 3.5 Payment / 3.6 Result-history-admin
- N/A (W10 không đụng M08/M11/M09). **Nhưng** `api_contract §4` writing-result route thuộc Writing AI → F-B.

## 4. Frontend Review

### 4.1 Requirement vs implementation
| Requirement | Implemented? | Evidence | Gap |
|---|---|---|---|
| Contract trước code | ✅ | `w10_writing_ui_contract.md` | — |
| Layout 2 cột đề\|viết | ✅ | `WritingRunner.tsx` | — |
| Word count realtime 150/250 | ✅ | browser: "160 từ ✓"/"260 từ ✓"; submit disable→enable | — |
| Submit→`/api/grade-writing`, render server | ✅ | browser: overall 6.0 server | — |
| Hiển thị band+overall+công thức | ✅ | result panel + "Overall = T1×1/3+T2×2/3" | — |
| No client score | ✅ | grep no `lib/scoring` import | — |

### 4.2 UI/client review
- Server gate page ✅; states loading/locked/notfound/error/active/submitting/result ✅; mobile no overflow ✅; labels/aria-live ✅; no secret/scoring import ✅; lỗi giữ bài ✅; console 0 error ✅.
- ⚠️ **F-G (P3):** draft KHÔNG persist khi reload (mất text; reload→attempt mới). TaskBrief FE không yêu cầu autosave Writing → không phải gate blocker, nhưng UX gap (khác W9 reading có autosave).
- ⚠️ **F-B (P2):** không có trang `/writing-result/[id]` → kết quả chỉ xem được inline ngay sau chấm; reload là mất (dữ liệu vẫn trong DB nhưng không có route/page đọc).

### 4.3 Writing UI
- Prompt Task1/Task2 hiển thị ✅; word count ✅; submit disabled tới khi đủ ✅; double-submit chặn (disable khi submitting) ✅; pending/result/error state ✅; feedback/criteria từ API whitelist ✅; no client grading ✅; mobile usable ✅.

### 4.4 Browser evidence
- Desktop 1280×850 + mobile 385×812: happy path PASS; word count realtime; result panel; mock disclaimer; no leak; 0 console error.
- ⚠️ Screenshot artifact timeout (Fast-Refresh churn) → dùng eval/snapshot functional thay ảnh. Browser **unauth/forbidden path** chưa chụp riêng cho /writing (server gate verify qua code + start-route guard) → F-H (P3, non-core).

## 5. Security Invariants
| # | Invariant | Status | Evidence | Finding |
|---|---|---|---|---|
| 3 | service_role key không ra client | ✅ | server-only; smoke no leak | — |
| 6 | AI provider key không ra client | ✅ | `'server-only'`, no client import, smoke | — |
| 7 | AI system prompt không ra client | ✅ | smoke no system-prompt text | — |
| 12 | Grading server-only | ✅ | route+lib server-only; FE no scoring | — |
| 14 | Result/feedback owner-guard | ◐ | grade-writing owner ✅; **read route writing-result chưa có** | F-B |
| 19 | RLS client không tự ghi bảng nhạy cảm | ✅ | writing_submissions UPDATE denied; RPC reserve denied (smoke) | — |
| 20 | KHÔNG claim AI production verified nếu mock | ✅ (tôn trọng) | gate = CONDITIONAL, không claim live | F-A |
| 1,2,8,9,10,11,13 | answer_keys/audio_key/payload/timer (reading/listening) | ✅ không đổi | W10 không chạm exam payload/scoring | — |
| 4,5,17,18 | payment/redeem secret | N/A | W10 không đụng M08 | — |

→ **Không có security regression.** Invariant #20 (không overclaim) được tôn trọng đúng (đây là lý do CONDITIONAL).

## 6. Evidence Matrix
| Test/Command | Required? | Ran? | Result | Source | Gate impact |
|---|---|---|---|---|---|
| `npm run typecheck` | Yes | Yes | **PASS** | phiên này | OK |
| `npm run build` | Yes | Yes (clean, đầu phiên) | **PASS** (`/api/grade-writing`,`/writing/[id]`=ƒ) | phiên này | OK (re-run blocked bởi dev-server .next contention; cùng bytes) |
| `npm run db:verify` | Yes | Yes | **ALL PASSED** (1–21 + RPC) | phiên này | OK |
| `writing_grading_smoke.mjs` (MOCK) | Yes | Yes | **23/23** | phiên này | OK cho scaffold; **không phủ live AI** |
| Browser desktop/mobile (Writing UI) | Yes (UI core) | Yes (functional via eval) | **PASS** 0 console error | phiên này | OK; screenshot artifact thiếu (F-H) |
| **Live Claude smoke** | Yes (core) | **NO** (no API key) | **BLOCKED/GAP** | — | **P1 — chặn full PASS/W11** |

## 7. Findings

### F-A — Live AI grading chưa verify runtime (core deliverable)
- Severity: **P1** · Confidence: High · Area: Backend/M07
- Evidence: `lib/ai/writing-grader.ts` `useMock()` true khi thiếu `ANTHROPIC_API_KEY`; `.env.local` không có key; smoke chạy MOCK. Path live (tool-use + parse + bandsValid) chưa từng chạy.
- Why: deliverable cốt lõi W10 là "AI grading cơ bản"; mock chỉ verify scaffold (validate/persist/rate-limit), KHÔNG verify Claude integration thật. Gate rule cấm claim AI verified khi chỉ mock.
- Fix: set `ANTHROPIC_API_KEY` server env → chạy 1 ca live `/api/grade-writing` (bỏ mock) → assert band hợp lý + tool-use path + no leak.
- Verification: `WRITING_GRADER_MOCK` unset + key set → `node supabase/smoke/writing_grading_smoke.mjs` (sửa smoke bỏ assert mock:true) hoặc 1 ca thủ công.
- Gate impact: **chặn full PASS & W11** (TaskBrief cho phép mock ở mức report, nhưng gate W11 cần core verified → CONDITIONAL).

### F-B — `/api/writing-result/[id]` + trang `/writing-result/[id]` thiếu (định nghĩa ở api_contract §4)
- Severity: **P2** · Confidence: High · Area: Backend+Frontend/M07
- Evidence: `api_contract.md §4` liệt kê `GET /api/writing-result/[id]` (owner-guard, đọc `writing_submissions`) + trang. Repo không có route/page này (Glob app/api/writing-result, app/writing-result = none).
- Why: kết quả chấm chỉ xem inline ngay sau submit; reload/quay lại → mất hiển thị (dù `ai_score` đã lưu DB). Người dùng không xem lại được bài đã chấm.
- Fix: hoặc implement `GET /api/writing-result/[id]` (owner-guard) + page (nhỏ), hoặc **chính thức defer** trong api_contract/roadmap (ghi "= M09/W11") để khớp TaskBrief.
- Verification: tạo route + smoke owner/cross-user; hoặc cập nhật api_contract đánh dấu deferred.
- Gate impact: P2 — nên đóng/định-vị-lại trước W11.

### F-C — `grade-writing` thiếu guard `test.type === 'writing'`
- Severity: **P2** · Confidence: High · Area: Backend
- Evidence: `lib/exam/writing.ts` đọc `testRow.type` nhưng **không kiểm tra** (grep `type === 'writing'` = no match). Owner attempt của test reading/listening (in_progress) → grade-writing vẫn chấm text như writing, ghi `writing_submissions` cho non-writing test + **finalize attempt status=submitted, band=overall** (bỏ qua scoring reading/listening).
- Why: data-integrity/domain bug. Chỉ ảnh hưởng dữ liệu của chính user (không cross-user, không money) nhưng phá luồng submit/scoring đúng của reading/listening.
- Fix: sau khi đọc test, `if (testRow.type !== 'writing') return { ok:false, code:'NOT_FOUND' }` (hoặc VALIDATION_ERROR).
- Verification: smoke: start reading attempt (66666666) → POST /api/grade-writing → expect 404/400 (không chấm, không finalize).
- Gate impact: P2 — fix trước W11.

### F-D — (gộp vào F-C)

### F-E — Re-grade không cập nhật `attempts.band`
- Severity: **P3** · Confidence: Medium · Area: Backend
- Evidence: `lib/exam/writing.ts` finalize chỉ khi `status==='in_progress'`; Pro re-grade (attempt đã submitted) cập nhật `writing_submissions.ai_score` mới nhưng `attempts.band` giữ giá trị lần đầu → lệch với history/dashboard (M09 đọc attempts.band).
- Fix: cập nhật `attempts.band = overall` mỗi lần grade (kể cả terminal) hoặc thống nhất nguồn band = writing_submissions.
- Verification: Pro grade 2 lần khác độ dài → so attempts.band vs ai_score.overall_band.
- Gate impact: P3.

### F-F — Status 502 cho AI_UNAVAILABLE ngoài convention
- Severity: **P3** · Confidence: Medium · Area: Backend/api_contract
- Evidence: `route.ts:40` `status: 502`. Convention dự án (api_contract ví dụ + chuẩn review) dùng 4xx/500.
- Fix: cân nhắc 503 (service unavailable) hoặc 500; hoặc ghi 502 vào api_contract như chuẩn cho upstream-AI-fail.
- Gate impact: P3.

### F-G — Writing draft không persist khi reload
- Severity: **P3** · Confidence: High · Area: Frontend
- Evidence: `WritingRunner` giữ text ở state; reload → mất + start tạo attempt mới.
- Why: TaskBrief FE W10 KHÔNG yêu cầu autosave → không phải gate blocker; nhưng UX gap (W9 reading có autosave).
- Fix: autosave answers cho writing (tái dùng cơ chế W9) — đề xuất W11/polish.
- Gate impact: P3.

### F-H — Browser unauth/forbidden path cho /writing chưa chụp riêng
- Severity: **P3** · Confidence: Medium · Area: Frontend/evidence
- Evidence: browser smoke chỉ happy path (authed). Server gate verify qua code + start-route guard (smoke unauth→401).
- Fix: browser smoke thêm guest /writing→redirect login + locked test→locked state.
- Gate impact: P3 (non-core).

### F-I — Concurrent reserve race / refund best-effort
- Severity: **P3** · Confidence: Low · Area: Backend
- Evidence: 2 request đồng thời có thể reserve 1 và 2; refund-on-fail có thể trả nhầm slot.
- Fix: per-attempt idempotency hoặc reservation gắn request-id (W11 hardening).
- Gate impact: P3.

### Info
- **Info-J:** Live AI / production chưa verify (env: thiếu key). Không phải lỗi code.
- **Info-K:** W10 mở trên W9 **CONDITIONAL** (residual W9-R1/R2/R3 còn mở).
- **Info-L:** `docs/` gitignore toàn repo → report/contract W10 local-only; chỉ `W10_Leader_Review/Gate` force-add lên nhánh `w10-leader`.
- **Info-M:** error code mới (`AI_UNAVAILABLE`,`WORD_COUNT_TOO_LOW`) chưa liệt kê trong api_contract (api_contract không enumerate đầy đủ → không strict mismatch).

## 8. Missing Evidence / Blockers
- **Live Claude runtime** (F-A) — thiếu `ANTHROPIC_API_KEY`.
- **`/api/writing-result` + page** (F-B) — chưa implement / chưa định vị roadmap.
- Browser screenshot artifact (Fast-Refresh churn) — dùng functional eval thay ảnh.

## 9. Required Fixes Before W11
1. **F-A (P1):** live-verify AI grading bằng `ANTHROPIC_API_KEY` thật (hoặc Owner chấp nhận rủi ro mock + ghi roadmap violation rõ ràng).
2. **F-C (P2):** thêm guard `test.type === 'writing'` trong `grade-writing`.
3. **F-B (P2):** implement `/api/writing-result/[id]` + page, hoặc cập nhật api_contract đánh dấu deferred (M09/W11) để khớp scope.
4. (Nên) F-E, F-F trước khi vào M09/business.

## 10. Final Recommendation
**CONDITIONAL — W11 KHÔNG mở.** Scaffold W10 (Writing UI + grading route + Zod + server overall + rate limit + security) verify runtime trên MOCK, không P0, không security regression, không overclaim. Nhưng core AI grading chưa verify live (P1) + 2 gap P2 (writing-result route, test-type guard). Đóng các mục §9 (tối thiểu F-A + F-C) rồi mới mở W11.
