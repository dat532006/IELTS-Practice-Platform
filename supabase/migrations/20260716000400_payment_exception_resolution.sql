-- PAY-004: resolve a payment exception and its financial effect in one
-- transaction. Every resolved case has exactly one linked ledger entry.

alter table public.payment_exceptions
  add column if not exists ledger_txn_id uuid references public.transactions(id);

alter table public.transactions
  add column if not exists payment_exception_id uuid unique references public.payment_exceptions(id);

create or replace function public.resolve_payment_exception_v2(
  p_id uuid,
  p_admin uuid,
  p_status text,
  p_note text,
  p_coin_delta integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.payment_exceptions%rowtype;
  v_coins integer;
  v_ledger uuid;
begin
  select * into v_case
    from public.payment_exceptions
   where id = p_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_case.status <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_RESOLVED');
  end if;
  if p_status = 'ignored' and coalesce(p_coin_delta, 0) <> 0 then
    return jsonb_build_object('ok', false, 'code', 'IGNORED_WITH_DELTA');
  end if;
  if p_status = 'resolved' and coalesce(p_coin_delta, 0) = 0 then
    return jsonb_build_object('ok', false, 'code', 'RESOLUTION_DELTA_REQUIRED');
  end if;
  if p_status not in ('resolved', 'ignored') then
    return jsonb_build_object('ok', false, 'code', 'BAD_STATUS');
  end if;

  if p_status = 'resolved' then
    if v_case.user_id is null then
      return jsonb_build_object('ok', false, 'code', 'USER_REQUIRED');
    end if;

    update public.profiles
       set coins = coins + p_coin_delta
     where id = v_case.user_id and coins + p_coin_delta >= 0
     returning coins into v_coins;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_COINS');
    end if;

    insert into public.transactions (
      user_id, amount_coins, type, status, note, payment_exception_id
    ) values (
      v_case.user_id,
      abs(p_coin_delta),
      case when p_coin_delta > 0 then 'bonus'::public.txn_type_t else 'adjust'::public.txn_type_t end,
      'success'::public.txn_status_t,
      'payment_exception:' || p_id::text || ' ' || coalesce(p_note, ''),
      p_id
    ) returning id into v_ledger;
  end if;

  update public.payment_exceptions
     set status = p_status,
         resolution_note = p_note,
         resolved_by = p_admin,
         resolved_at = now(),
         ledger_txn_id = v_ledger
   where id = p_id;

  return jsonb_build_object('ok', true, 'ledger_txn_id', v_ledger, 'coins', v_coins);
end
$$;

revoke all on function public.resolve_payment_exception_v2(uuid, uuid, text, text, integer) from public;
grant execute on function public.resolve_payment_exception_v2(uuid, uuid, text, text, integer) to service_role;
