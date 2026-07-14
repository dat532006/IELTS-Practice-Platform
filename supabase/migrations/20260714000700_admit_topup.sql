-- ============================================================
-- PAY-003 — Nhận (admission) topup pending ATOMIC + có KHOÁ per-user. Trước đây /api/payment/create
--   ĐẾM pending chưa hết hạn rồi INSERT ở HAI bước tách rời (không khoá) → nhiều request đồng thời cùng
--   thấy count < cap rồi cùng insert → vượt cap (11 request → 11 pending). Cap để chống spam pending
--   (rác ledger/đối soát) bị bypass.
--   Fix: 1 RPC = 1 transaction, `pg_advisory_xact_lock(hashtext('topup-admit:'||user))` serialize
--   admission THEO USER (auto-release lúc commit) → đếm + insert nguyên tử; user khác hash khác → không
--   hotspot toàn cục. Đếm CHỈ pending chưa hết hạn (expired do cron KHÔNG chiếm slot). service_role only
--   (route đã getSessionUser + tự tính amount_coins/provider_txn_id/expires_at — KHÔNG tin client).
--   Rollback: drop function (route quay lại count+insert cũ).
-- ============================================================
create or replace function public.admit_topup(
  p_user_id uuid,
  p_amount_vnd integer,
  p_amount_coins integer,
  p_provider text,
  p_provider_txn_id text,
  p_expires_at timestamptz,
  p_max_pending integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  -- Serialize admission của CÙNG user (các user khác không chờ nhau).
  perform pg_advisory_xact_lock(hashtext('topup-admit:' || p_user_id::text));

  select count(*) into v_count
  from public.transactions
  where user_id = p_user_id and type = 'topup' and status = 'pending' and expires_at > now();

  if v_count >= p_max_pending then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;

  insert into public.transactions (user_id, amount_vnd, amount_coins, type, provider, provider_txn_id, status, expires_at)
  values (p_user_id, p_amount_vnd, p_amount_coins, 'topup', p_provider::public.provider_t, p_provider_txn_id, 'pending', p_expires_at);

  return jsonb_build_object('ok', true, 'provider_txn_id', p_provider_txn_id);
end $$;

revoke all on function public.admit_topup(uuid, integer, integer, text, text, timestamptz, integer) from public;
grant execute on function public.admit_topup(uuid, integer, integer, text, text, timestamptz, integer) to service_role;
