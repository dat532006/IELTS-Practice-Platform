-- ============================================================
-- W1+2 Backend — Indexes (docs/Architecture/database_schema.md §4)
-- (slug uniques, code_hash unique, *_unlocks uniques đã tự tạo index)
-- ============================================================

create index if not exists idx_products_catalog       on public.products      (status, sort_order, created_at);
create index if not exists idx_test_unlocks_user_test  on public.test_unlocks  (user_id, test_id);
create index if not exists idx_attempts_user_started   on public.attempts      (user_id, started_at desc);
create index if not exists idx_tests_question_types    on public.tests using gin (question_types);
create index if not exists idx_collection_tests_test   on public.collection_tests (test_id);
create index if not exists idx_order_items_order       on public.order_items   (order_id);
create index if not exists idx_transactions_user       on public.transactions  (user_id, created_at desc);
