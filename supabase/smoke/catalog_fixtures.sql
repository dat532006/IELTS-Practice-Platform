-- ============================================================
-- W3 runtime-smoke fixtures (LOCAL ONLY — do not run on prod).
-- Adds variety on top of seed.sql so /api/products can be smoked for:
--   published-only exclusion, free filter, skill/qtype/difficulty filter,
--   sort=hot ordering, is_free badge.
-- Idempotent (on conflict do nothing). Refreshes product_search at end.
-- ============================================================

-- Tests --------------------------------------------------------
insert into public.tests (id, slug, title, type, source, is_free, difficulty, question_types, attempts_count, status, passages, questions) values
  -- free LISTENING test (drives has_free_test + skill=listening)
  ('a1111111-1111-1111-1111-111111111111', 'smoke-listening-free', 'Smoke Listening Free', 'listening', 'Tự soạn', true, 1,
   '{mcq,map_labelling}', 7, 'published',
   '[{"id":"p1","number":1,"title":"L","content":"x"}]'::jsonb,
   '[{"id":"q1","passage_id":"p1","number":1,"type":"mcq","instruction":"i","points":1}]'::jsonb),
  -- paid WRITING test, high attempts (drives sort=hot first + skill=writing + qtype=essay + difficulty=4)
  ('b2222222-2222-2222-2222-222222222222', 'smoke-writing-paid', 'Smoke Writing Paid', 'writing', 'Tự soạn', false, 4,
   '{essay}', 99, 'published',
   '[{"id":"p1","number":1,"title":"W","content":"x"}]'::jsonb,
   '[{"id":"q1","passage_id":"p1","number":1,"type":"essay","instruction":"i","points":1}]'::jsonb),
  -- a draft test (used by the draft product; should never surface)
  ('c3333333-3333-3333-3333-333333333333', 'smoke-draft-test', 'Smoke Draft Test', 'reading', 'Tự soạn', true, 2,
   '{tfng}', 3, 'draft',
   '[]'::jsonb, '[]'::jsonb)
on conflict (slug) do nothing;

-- Products -----------------------------------------------------
insert into public.products (id, slug, title, description, kind, price_coins, status, sort_order) values
  -- PUBLISHED + price 0 (is_free badge) + has a free test (free filter)
  ('d4444444-4444-4444-4444-444444444444', 'smoke-listening-free-vol', 'SMOKE LISTENING FREE VOL', 'free listening bundle', 'bundle', 0, 'published', 5),
  -- PUBLISHED + paid + highest attempts (hot sort)
  ('e5555555-5555-5555-5555-555555555555', 'smoke-writing-hot-vol', 'SMOKE WRITING HOT VOL', 'hot writing bundle', 'bundle', 300, 'published', 3),
  -- DRAFT — must be excluded from catalog
  ('f6666666-6666-6666-6666-666666666666', 'smoke-draft-vol', 'SMOKE DRAFT VOL', 'draft bundle', 'bundle', 150, 'draft', 2),
  -- HIDDEN — must be excluded from catalog
  ('07777777-7777-7777-7777-777777777777', 'smoke-hidden-vol', 'SMOKE HIDDEN VOL', 'hidden bundle', 'bundle', 120, 'hidden', 4)
on conflict (slug) do nothing;

-- Collection links ---------------------------------------------
insert into public.collection_tests (product_id, test_id, position) values
  ('d4444444-4444-4444-4444-444444444444', 'a1111111-1111-1111-1111-111111111111', 1),
  ('e5555555-5555-5555-5555-555555555555', 'b2222222-2222-2222-2222-222222222222', 1),
  ('f6666666-6666-6666-6666-666666666666', 'c3333333-3333-3333-3333-333333333333', 1),
  ('07777777-7777-7777-7777-777777777777', 'b2222222-2222-2222-2222-222222222222', 1)
on conflict do nothing;

refresh materialized view public.product_search;

-- Sanity dump (visible in psql output)
select slug, status, price_coins, skills, has_free_test, attempts_total, test_count
from public.product_search order by slug;
