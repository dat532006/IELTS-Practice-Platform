-- PAY-002 mixed-mode compatibility:
-- beneficiary binding is mandatory for the live SePay route, whose server-side
-- configuration guard runs before this service-role-only RPC. The generic HMAC
-- sandbox intentionally has no real beneficiary and must remain usable in CI.

create or replace function public.admit_topup_v2(
  p_user_id uuid,
  p_amount_vnd integer,
  p_amount_coins integer,
  p_provider text,
  p_provider_txn_id text,
  p_expires_at timestamptz,
  p_max_pending integer,
  p_beneficiary_account text,
  p_beneficiary_bank text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('topup-admit:' || p_user_id::text));

  select count(*) into v_count
    from public.transactions
   where user_id = p_user_id
     and type = 'topup'
     and status = 'pending'
     and expires_at > now();

  if v_count >= p_max_pending then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;

  insert into public.transactions (
    user_id, amount_vnd, amount_coins, type, provider, provider_txn_id,
    status, expires_at, beneficiary_account, beneficiary_bank
  ) values (
    p_user_id, p_amount_vnd, p_amount_coins, 'topup',
    p_provider::public.provider_t, p_provider_txn_id, 'pending', p_expires_at,
    nullif(btrim(p_beneficiary_account), ''), nullif(btrim(p_beneficiary_bank), '')
  );

  return jsonb_build_object(
    'ok', true,
    'provider_txn_id', p_provider_txn_id,
    'beneficiary_bound',
      nullif(btrim(p_beneficiary_account), '') is not null
      and nullif(btrim(p_beneficiary_bank), '') is not null
  );
end
$$;

revoke all on function public.admit_topup_v2(uuid, integer, integer, text, text, timestamptz, integer, text, text) from public;
grant execute on function public.admit_topup_v2(uuid, integer, integer, text, text, timestamptz, integer, text, text) to service_role;
