-- ============================================================
-- W1+2 Backend — Core domain tables
-- FK order theo docs/Architecture/database_schema.md §1:
--   profiles → tests → answer_keys → products → collection_tests → score_bands
--   → attempts → writing_submissions → orders → order_items → transactions
--   → cart_items → activation_codes → redemptions → product_unlocks
--   → test_unlocks → bookmarks → ai_grade_usage → vocab_log
-- (orders/order_items TRƯỚC transactions; activation_codes → redemptions → product_unlocks)
-- ============================================================

-- 1) profiles — mở rộng auth.users (KHÔNG tự quản password)
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  name       text,
  avatar     text,
  coins      integer     not null default 0,   -- 🔐 cột nhạy cảm
  plan       public.plan_t not null default 'free', -- 🔐
  role       public.role_t not null default 'user', -- 🔐 chống tự nâng quyền
  created_at timestamptz not null default now()
);

-- 2) tests — bộ đề (passages/questions KHÔNG chứa đáp án)
create table public.tests (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique,
  title          text,
  type           public.test_type_t,
  source         text,
  is_free        boolean not null default false,
  difficulty     smallint,
  question_types text[],
  attempts_count integer not null default 0,
  passages       jsonb,   -- 🔐 premium payload (chỉ trả qua server sau access check)
  questions      jsonb,   -- 🔐 premium payload (KHÔNG chứa đáp án)
  status         public.test_status_t not null default 'draft',
  created_at     timestamptz not null default now()
);

-- 3) answer_keys — 🔐 RLS DENY toàn bộ client, chỉ service_role/RPC đọc
create table public.answer_keys (
  test_id uuid primary key references public.tests(id) on delete cascade,
  keys    jsonb
);

-- 4) products — GIÁ source of truth (price_coins)
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique,
  title       text,
  description text,
  thumbnail   text,
  kind        public.product_kind_t,
  price_coins integer not null default 0,  -- 🔐 source of truth giá
  status      public.product_status_t not null default 'draft',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- 5) collection_tests — mục lục product → đề
create table public.collection_tests (
  product_id uuid not null references public.products(id) on delete cascade,
  test_id    uuid not null references public.tests(id) on delete cascade,
  position   integer not null default 0,
  primary key (product_id, test_id)
);

-- 6) score_bands — quy đổi raw → band (R/L)
create table public.score_bands (
  id        serial primary key,
  test_type public.score_band_type_t,
  raw_min   smallint,
  raw_max   smallint,
  band      numeric(2,1)
);

-- 7) attempts — lịch sử làm bài (started_at neo server)
create table public.attempts (
  id            uuid not null default gen_random_uuid(),
  user_id       uuid references public.profiles(id),
  test_id       uuid references public.tests(id),
  status        public.attempt_status_t not null default 'in_progress',
  started_at    timestamptz not null default now(),  -- 🔐 neo thời gian ở server
  duration_sec  integer,
  answers       jsonb,
  raw_score     smallint,
  band          numeric(2,1),
  time_spent    integer,
  highlights    jsonb,
  bookmarked_qs jsonb not null default '[]'::jsonb,
  submitted_at  timestamptz,
  primary key (id),
  unique (user_id, test_id, started_at),
  unique (id, user_id)   -- để bảng con tham chiếu composite FK (id,user_id)
);

-- 8) writing_submissions — composite FK đảm bảo user_id khớp attempts
create table public.writing_submissions (
  id         uuid primary key default gen_random_uuid(),
  attempt_id uuid,
  user_id    uuid,    -- 🔐 RLS check trực tiếp
  task1_text text,
  task2_text text,
  task1_wc   integer,
  task2_wc   integer,
  ai_score   jsonb,
  graded_at  timestamptz,
  foreign key (attempt_id, user_id) references public.attempts(id, user_id) on delete cascade
);

-- 9) orders — đơn mua product (audit)
create table public.orders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id),
  total_coins integer,   -- 🔐 snapshot tổng server-side
  status      public.order_status_t not null default 'pending',
  created_at  timestamptz not null default now()
);

-- 10) order_items — snapshot giá từng product
create table public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references public.orders(id) on delete cascade,
  product_id  uuid references public.products(id),
  price_coins integer,   -- 🔐 snapshot products.price_coins lúc checkout
  quantity    integer not null default 1,
  unique (order_id, product_id)
);

-- 11) transactions — ledger coin (idempotency webhook)
create table public.transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id),
  amount_coins    integer,
  type            public.txn_type_t,
  order_id        uuid references public.orders(id),
  provider        public.provider_t,
  provider_txn_id text,
  status          public.txn_status_t not null default 'pending',
  created_at      timestamptz not null default now(),
  unique (provider, provider_txn_id)   -- 🔐 idempotency webhook
);

-- 12) cart_items — giỏ hàng (KHÔNG lưu giá)
create table public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id),
  product_id uuid references public.products(id),
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

-- 13) activation_codes — 🔐 bearer secret, chỉ lưu HMAC hash
create table public.activation_codes (
  id              uuid primary key default gen_random_uuid(),
  code_hash       text unique,   -- HMAC-SHA256(code, ACTIVATION_CODE_PEPPER)
  code_prefix     text,
  code_last4      text,
  product_id      uuid references public.products(id),
  status          public.code_status_t not null default 'active',
  max_redemptions integer not null default 1,
  redeemed_count  integer not null default 0,
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- 14) redemptions — audit + idempotency (FK code_id → activation_codes)
create table public.redemptions (
  id         uuid primary key default gen_random_uuid(),
  code_id    uuid references public.activation_codes(id),
  user_id    uuid references public.profiles(id),
  product_id uuid references public.products(id),
  created_at timestamptz not null default now(),
  unique (code_id, user_id)   -- 🔐 1 user / 1 mã / 1 lần
);

-- 15) product_unlocks — nguồn sở hữu product (FK order_id + redemption_id)
create table public.product_unlocks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles(id),
  product_id    uuid references public.products(id),
  via           public.unlock_via_t,
  order_id      uuid references public.orders(id),
  redemption_id uuid references public.redemptions(id),
  created_at    timestamptz not null default now(),
  unique (user_id, product_id)
);

-- 16) test_unlocks — cache phẳng để mở /exam nhanh
create table public.test_unlocks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id),
  test_id    uuid references public.tests(id),
  product_id uuid references public.products(id),
  created_at timestamptz not null default now(),
  unique (user_id, test_id, product_id)
);

-- 17) bookmarks — đề đã bookmark
create table public.bookmarks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id),
  test_id    uuid references public.tests(id),
  created_at timestamptz not null default now(),
  unique (user_id, test_id)
);

-- 18) ai_grade_usage — rate limit AI Writing
create table public.ai_grade_usage (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  used_on date not null default current_date,
  count   integer not null default 0,
  unique (user_id, used_on)
);

-- 19) vocab_log
create table public.vocab_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id),
  word       text,
  definition text,
  example    text,
  created_at timestamptz not null default now(),
  unique (user_id, word)
);
