# DEPLOY — IELTS Practice Platform (chi tiết từng bước)

Stack: **Next.js 15** (App Router) · **Supabase** (Postgres + RLS + Auth) · **Cloudflare R2** · **Anthropic** · **Vercel** (+ Vercel Cron).

Làm tuần tự **A → G**. Runbook & rollback đầy đủ: `docs/Deployment/deployment_guide.md`.

> 🔒 **DB SAFETY:** chỉ apply migration **additive** theo thứ tự tên. TUYỆT ĐỐI KHÔNG `supabase db reset`/destructive trên prod.
> 🔑 **answer_keys nhập tay 100%** — không bao giờ import tự động (key sai = chấm sai người trả tiền).

---

## Phase A — Chuẩn bị (máy local)

**A1. Cài CLI**
```bash
npm i -g supabase        # Supabase CLI (hoặc: scoop install supabase)
npm i -g vercel          # Vercel CLI (tuỳ chọn — có thể dùng dashboard)
supabase --version && vercel --version
```

**A2. Sinh secret ngẫu nhiên** (chạy 4 lần, lưu lại — dùng ở Phase D):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Dùng cho: `ACTIVATION_CODE_PEPPER`, `PAYMENT_WEBHOOK_SECRET`, `CRON_SECRET`, `AI_GRADE_IP_RATE_LIMIT_PEPPER`.
> ⚠️ `ACTIVATION_CODE_PEPPER` đổi sau khi đã phát code → mọi code cũ vô hiệu. Sinh **một lần**, giữ cố định.

---

## Phase B — Supabase production

**B1. Tạo project** — app.supabase.com → New project (region gần VN, vd Singapore). Lưu **DB password**.

**B2. Lấy keys** — Settings → API:
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (**server-only, không lộ client**)
- Project ref (chuỗi trong URL) → dùng ở B4

**B3. Backup mốc 0** — Database → Backups (bật PITR nếu có) để rollback được.

**B4. Link + đẩy migration** (từ thư mục repo):
```bash
supabase login
supabase link --project-ref <prod-ref>      # nhập DB password
supabase db push                             # áp TOÀN BỘ supabase/migrations/* theo thứ tự
```

**B5. Verify RLS trên prod** — SQL Editor:
```sql
select relname, relrowsecurity from pg_class
where relnamespace='public'::regnamespace and relkind='r' order by relname;
```
→ mọi bảng nhạy cảm (`profiles`, `answer_keys`, `transactions`, `activation_codes`, `attempts`…) phải `relrowsecurity = true`.
(Tập migration đúng thứ tự/RLS đã được chứng minh local bằng `npm run db:verify` — xanh.)

**B6. (Tuỳ) Seed content** — chỉ seed đề **có bản quyền hợp lệ**. `supabase/seed.sql` là mẫu, cân nhắc kỹ trước khi chạy prod.

---

## Phase C — R2 + Anthropic

**C1. Cloudflare R2** — tạo bucket → API Token (Object Read & Write). Lấy `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ACCOUNT_ID`. Set **CORS** cho phép domain prod (audio phát qua signed URL từ browser).

**C2. Anthropic** — console.anthropic.com → API key prod → `ANTHROPIC_API_KEY`. Nạp billing/credit.

---

## Phase D — Vercel: import + env + deploy

**D1. Import repo** — vercel.com → Add New → Project → chọn repo GitHub. Framework tự nhận **Next.js**, root = repo, build `next build`. **Set env trước khi deploy.**

**D2. Environment Variables** (Settings → Environment Variables, scope **Production**):

| Biến | Nguồn |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | B2 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | B2 |
| `NEXT_PUBLIC_SITE_URL` | `https://<domain>` (Phase E) |
| `SUPABASE_SERVICE_ROLE_KEY` | B2 |
| `ANTHROPIC_API_KEY` | C2 |
| `ACTIVATION_CODE_PEPPER` | A2 |
| `PAYMENT_WEBHOOK_SECRET` | A2 (+ `VNPAY_SECRET`/`MOMO_SECRET` khi cổng thật) |
| `CRON_SECRET` | A2 |
| `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` `R2_BUCKET` `R2_ACCOUNT_ID` | C1 |
| `AI_GRADE_IP_RATE_LIMIT_PEPPER` | A2 |

> ⚠️ **KHÔNG** thêm `WRITING_GRADER_MOCK` ở prod (mock = chấm Writing giả, không gọi Anthropic).
> Tuỳ chọn: `AI_GRADE_IP_DAILY_LIMIT` (mặc định 20), `R2_URL_TTL_SEC` (60..900), `TRUST_FORWARDED_IP`, `WRITING_GRADER_MODEL`.

**D3. (Tuỳ) Node version** — Settings → Node.js Version = 20.x.

**D4. Deploy** — bấm Deploy (hoặc `vercel --prod`). Build enforce ESLint + `tsc --noEmit` (đã test local **xanh**). Ghi lại URL `*.vercel.app`.

---

## Phase E — Domain, Auth redirect, webhook, cron

**E1. Domain** — Vercel → Settings → Domains → add → cập nhật DNS (A/CNAME). Sau khi active, đảm bảo `NEXT_PUBLIC_SITE_URL` = domain này; nếu vừa đặt biến → **redeploy** để metadata/robots/sitemap dùng đúng.

**E2. Supabase Auth URL** (hay quên!) — Authentication → URL Configuration:
- **Site URL** = `https://<domain>`
- **Redirect URLs** thêm `https://<domain>/auth/callback`
- Prod nên cấu hình **custom SMTP** (Auth → Emails); SMTP mặc định của Supabase giới hạn thấp.

**E3. Payment webhook** — ở dashboard cổng thanh toán: URL = `https://<domain>/api/payment/webhook`, secret khớp `PAYMENT_WEBHOOK_SECRET` (sandbox HMAC) hoặc scheme provider (live).

**E4. Cron** — `vercel.json` tự đăng ký job `reconcile-topups` (lịch `0 * * * *`) khi deploy. Kiểm Vercel → Cron Jobs. Test tay:
```bash
curl -i -H "Authorization: Bearer <CRON_SECRET>" https://<domain>/api/cron/reconcile-topups
# 200 {"expired":N}; token sai → 401; thiếu env CRON_SECRET → 503 (fail-closed)
```

---

## Phase F — Smoke test trên prod
- [ ] `https://<domain>` load OK; `/robots.txt` + `/sitemap.xml` ra đúng domain.
- [ ] Đăng ký → email verify → đăng nhập (xác nhận E2 hoạt động).
- [ ] Làm 1 đề **free** → nộp → xem kết quả.
- [ ] Chấm **Writing** → phải là AI thật (xác nhận `WRITING_GRADER_MOCK` không set).
- [ ] Topup/buy-now (sandbox) → webhook test → coin cộng đúng, idempotent.
- [ ] Nghe audio Listening (kiểm R2 + CORS).
- [ ] Log Vercel Cron sau 1 giờ (hoặc test tay E4).

---

## Phase G — Go-live THƯƠNG MẠI (Owner — không phải kỹ thuật)
- [ ] Cổng thanh toán/merchant **thật** (VNPAY/MOMO live + chữ ký thật, thay HMAC sandbox).
- [ ] Nội dung **pháp lý thật** (7 trang legal + business-confirmation) — publish.
- [ ] **Content đề có bản quyền** hợp lệ.
- [ ] **Vercel Pro** (trước khi bật thanh toán).

---

## Rollback
- **App:** Vercel → Deployments → promote bản trước.
- **DB:** KHÔNG rollback destructive nếu chưa có backup (B3).
- **Payment lỗi:** tạm khoá `checkout`/`redeem` (maintenance response / feature flag).

---
Ghi chú: `scripts/` (OCR/PDF importer) là tool nội bộ, **KHÔNG vào bundle web** → không ảnh hưởng deploy.
