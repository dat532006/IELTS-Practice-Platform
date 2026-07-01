-- ============================================================
-- W16 Backend (G9) — Reconciliation: dọn topup pending quá hạn (M08).
-- Source: docs/Architecture/payment_redeem_contract.md §3 + Current_State_Assessment §8 G9.
-- Topup pending có expires_at (20260607000100). Nếu quá hạn mà chưa settle (không webhook hợp lệ)
--   → đánh dấu status='failed' (txn_status_t chỉ có pending/success/failed → dùng 'failed').
-- ⚠️ TUYỆT ĐỐI KHÔNG cộng coin ở đây: credit CHỈ xảy ra ở credit_topup (webhook sau verify chữ ký + số tiền).
--   Reconciliation chỉ đóng vòng đời pending "chết", không đụng success (đã credit) — idempotent, chạy lại an toàn.
-- security definer + service_role only (client KHÔNG execute). Additive. Rollback:
--   drop function public.expire_pending_topups();
-- ============================================================
create or replace function public.expire_pending_topups(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.transactions
     set status = 'failed'
   where type = 'topup'
     and status = 'pending'
     and expires_at is not null
     and expires_at < p_now;
  get diagnostics v_count = row_count;
  return jsonb_build_object('status', 'OK', 'expired', v_count);
end;
$$;

revoke all on function public.expire_pending_topups(timestamptz) from public, anon, authenticated;
grant execute on function public.expire_pending_topups(timestamptz) to service_role;
