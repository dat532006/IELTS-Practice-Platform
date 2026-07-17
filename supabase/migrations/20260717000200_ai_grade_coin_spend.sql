-- ============================================================
-- Pay-per-grade — trừ coins cho lượt chấm AI Writing vượt hạn mức free/ngày (Owner 2026-07-17).
-- Nguồn tiền tệ đã có: profiles.coins + ledger public.transactions. RPC này DÙNG LẠI đúng pattern
--   conditional-debit của public.checkout: `coins = coins - cost WHERE coins >= cost` → 0 row = thiếu.
-- security definer: chạy quyền owner; server gọi qua service_role → trigger lock_sensitive_cols cho phép
--   sửa coins (request.jwt.claims.role = service_role). client KHÔNG execute (revoke).
-- Idempotency: KHÔNG cần ở đây — caller (submitWritingGrade) đã có claim_writing_grade (1 winner/attempt)
--   TRƯỚC khi charge, nên tối đa 1 lần trừ / attempt. Fail sau charge → refund_ai_grade_coins (hoàn + ghi
--   ledger type=refund) cho phép retry sạch.
-- Ledger: spend = amount ÂM (type=spend), refund = amount DƯƠNG (type=refund); provider=system,
--   provider_txn_id=NULL (nhiều NULL cùng tồn tại — unique(provider,provider_txn_id) coi NULL khác nhau,
--   y như checkout đang ghi). order_id để trống (chấm KHÔNG phải đơn mua product).
-- Idempotent DDL: create or replace. Rollback: drop function spend_ai_grade(uuid,integer),
--   refund_ai_grade_coins(uuid,integer).
-- ============================================================

-- Trừ p_cost coins nếu đủ; trả jsonb {ok, charged, balance[, needed]}. KHÔNG raise khi thiếu tiền
--   (thiếu tiền là luồng bình thường, không phải lỗi hệ thống) → caller map INSUFFICIENT_COINS.
create or replace function public.spend_ai_grade(p_user_id uuid, p_cost integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  -- Phòng thủ: cost không dương → không trừ, coi như OK (caller chỉ gọi khi cost>0).
  if p_cost is null or p_cost <= 0 then
    select coins into v_balance from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', true, 'charged', 0, 'balance', coalesce(v_balance, 0));
  end if;

  -- conditional debit: chỉ trừ khi đủ. 0 row ⇒ thiếu → trả balance hiện tại + needed.
  update public.profiles set coins = coins - p_cost
   where id = p_user_id and coins >= p_cost
   returning coins into v_balance;
  if not found then
    select coins into v_balance from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', false, 'charged', 0, 'balance', coalesce(v_balance, 0), 'needed', p_cost);
  end if;

  insert into public.transactions (user_id, amount_coins, type, provider, status)
  values (p_user_id, -p_cost, 'spend', 'system', 'success');

  return jsonb_build_object('ok', true, 'charged', p_cost, 'balance', v_balance);
end;
$$;

-- Hoàn p_cost coins (AI fail / finalize fail sau khi đã trừ) + ghi ledger type=refund. Best-effort.
create or replace function public.refund_ai_grade_coins(p_user_id uuid, p_cost integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_cost is null or p_cost <= 0 then return; end if;
  update public.profiles set coins = coins + p_cost where id = p_user_id;
  insert into public.transactions (user_id, amount_coins, type, provider, status)
  values (p_user_id, p_cost, 'refund', 'system', 'success');
end;
$$;

-- Client roles KHÔNG execute (chỉ service_role/server). Revoke mặc định rồi grant lại service_role.
revoke all on function public.spend_ai_grade(uuid, integer) from public, anon, authenticated;
revoke all on function public.refund_ai_grade_coins(uuid, integer) from public, anon, authenticated;
grant execute on function public.spend_ai_grade(uuid, integer) to service_role;
grant execute on function public.refund_ai_grade_coins(uuid, integer) to service_role;
