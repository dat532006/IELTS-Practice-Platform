-- ============================================================
-- W16 Backend — Topup VND amount + pending expiry (M08).
-- Fixed-rate pricing: 1.000 VND = 1 coin → amount_coins = amount_vnd / 1000 (enforce SERVER-side,
--   reject nếu amount_vnd % 1000 != 0; KHÔNG floor). amount_coins vẫn là nguồn credit cho credit_topup.
-- amount_vnd : số tiền fiat user phải trả (đối soát coin↔tiền; webhook verify paid == amount_vnd).
-- expires_at : TTL cho topup pending chưa settle (đối soát/dọn). KHÔNG dùng để auto-credit.
-- Additive — KHÔNG đụng dữ liệu cũ, KHÔNG đổi RPC. Rollback:
--   alter table public.transactions drop column amount_vnd, drop column expires_at;
-- ============================================================
alter table public.transactions
  add column if not exists amount_vnd integer,
  add column if not exists expires_at timestamptz;

comment on column public.transactions.amount_vnd is
  'Fiat VND phải trả cho topup (1000 VND = 1 coin). amount_coins = amount_vnd/1000 (server-derived).';
comment on column public.transactions.expires_at is
  'TTL cho topup pending (đối soát/dọn). KHÔNG dùng để auto-credit.';
