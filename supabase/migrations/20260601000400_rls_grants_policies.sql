-- ============================================================
-- W1+2 Backend — RLS enable + GRANTs + policies
-- Source: docs/Architecture/security_rls_contract.md §2, plan v1.6 §11
-- Nguyên tắc: secure-by-default. Revoke hết của anon/authenticated, rồi grant chính xác.
-- service_role (BYPASSRLS) là client server-only đọc/ghi đặc quyền — không cần policy.
-- ============================================================

-- 0) Reset: bỏ mọi quyền mặc định của client roles
revoke all on all tables in schema public from anon, authenticated;

-- 1) Public read (metadata) — anon + authenticated
--    ⚠️ tests: GRANT theo CỘT, KHÔNG cấp passages/questions (premium payload).
--    Exam payload chỉ trả qua server (service_role) sau access check (is_free | test_unlocks).
grant select (id, slug, title, type, source, is_free, difficulty, question_types,
              attempts_count, status, created_at) on public.tests to anon, authenticated;
grant select on public.products         to anon, authenticated;
grant select on public.collection_tests to anon, authenticated;
grant select on public.score_bands      to anon, authenticated;

-- 2) profiles: SELECT cho chủ sở hữu (UPDATE cột nhạy cảm cấp ở migration 000500)
grant select on public.profiles to authenticated;

-- 3) Owner full CRUD (dữ liệu cá nhân, KHÔNG ảnh hưởng chấm điểm/quyền truy cập)
grant select, insert, update, delete on
  public.cart_items, public.bookmarks, public.vocab_log
  to authenticated;

-- 4) Owner SELECT-only.
--    🔐 attempts / writing_submissions: WRITE chỉ qua server (service_role).
--    Không cho client tự set status/raw_score/band/ai_score (chấm điểm 100% server-side).
--    Đặc biệt chặn self-INSERT/self-set status='submitted' → tránh lộ answer_keys ở /result
--    và bypass premium gate. Ledger/đơn/unlock/redeem/rate-limit cũng server-only.
grant select on
  public.attempts, public.writing_submissions,
  public.transactions, public.orders, public.order_items,
  public.redemptions, public.product_unlocks, public.test_unlocks,
  public.ai_grade_usage
  to authenticated;

-- 5) answer_keys, activation_codes: KHÔNG grant gì cho client (deny)

-- ===== Enable RLS trên MỌI bảng public =====
alter table public.profiles            enable row level security;
alter table public.tests               enable row level security;
alter table public.answer_keys         enable row level security;
alter table public.products            enable row level security;
alter table public.collection_tests    enable row level security;
alter table public.score_bands         enable row level security;
alter table public.attempts            enable row level security;
alter table public.writing_submissions enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.transactions        enable row level security;
alter table public.cart_items          enable row level security;
alter table public.activation_codes    enable row level security;
alter table public.redemptions         enable row level security;
alter table public.product_unlocks     enable row level security;
alter table public.test_unlocks        enable row level security;
alter table public.bookmarks           enable row level security;
alter table public.ai_grade_usage      enable row level security;
alter table public.vocab_log           enable row level security;

-- ===== Policies =====

-- profiles: chỉ chủ sở hữu (INSERT do trigger bootstrap security definer; không có policy INSERT/DELETE cho client)
create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- tests: metadata published (column-grant đã chặn passages/questions)
create policy tests_select_published on public.tests
  for select to anon, authenticated using (status = 'published');

-- answer_keys: KHÔNG policy → deny toàn bộ client (service_role bypass)

-- products: metadata published
create policy products_select_published on public.products
  for select to anon, authenticated using (status = 'published');

-- collection_tests: chỉ lộ mapping khi CẢ product VÀ test đều published
-- (tránh lộ test_id/position của draft/hidden test qua bundle published)
create policy collection_tests_select_published on public.collection_tests
  for select to anon, authenticated
  using (
    exists (select 1 from public.products p
            where p.id = collection_tests.product_id and p.status = 'published')
    and exists (select 1 from public.tests t
                where t.id = collection_tests.test_id and t.status = 'published')
  );

-- score_bands: public read
create policy score_bands_select_all on public.score_bands
  for select to anon, authenticated using (true);

-- attempts: chủ sở hữu chỉ SELECT (INSERT/score/submit qua server service_role)
create policy attempts_select_own on public.attempts
  for select to authenticated using (user_id = auth.uid());

-- writing_submissions: chủ sở hữu chỉ SELECT (ghi ai_score qua server sau Zod)
create policy ws_select_own on public.writing_submissions
  for select to authenticated using (user_id = auth.uid());

-- transactions / orders / redemptions / product_unlocks / test_unlocks / ai_grade_usage: SELECT own
create policy txn_select_own on public.transactions
  for select to authenticated using (user_id = auth.uid());
create policy orders_select_own on public.orders
  for select to authenticated using (user_id = auth.uid());
create policy order_items_select_own on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o
                 where o.id = order_items.order_id and o.user_id = auth.uid()));
create policy redemptions_select_own on public.redemptions
  for select to authenticated using (user_id = auth.uid());
create policy product_unlocks_select_own on public.product_unlocks
  for select to authenticated using (user_id = auth.uid());
create policy test_unlocks_select_own on public.test_unlocks
  for select to authenticated using (user_id = auth.uid());
create policy ai_grade_usage_select_own on public.ai_grade_usage
  for select to authenticated using (user_id = auth.uid());

-- cart_items / bookmarks / vocab_log: chủ sở hữu CRUD
create policy cart_items_rw_own on public.cart_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy bookmarks_rw_own on public.bookmarks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy vocab_log_rw_own on public.vocab_log
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- activation_codes: KHÔNG policy → deny toàn bộ client (admin/server qua service_role)
