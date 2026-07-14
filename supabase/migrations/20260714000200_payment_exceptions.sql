-- ============================================================
-- PAY-004 — Durable, deduplicated payment exception reconciliation.
-- Trước đây webhook verify chữ ký + phát hiện lệch tiền chỉ ACK + console.log → không có bản ghi
--   bền, không dedup, không đối soát/giải quyết được. Fix: bảng payment_exceptions (immutable case),
--   RPC record (insert-on-conflict-do-nothing → dedup) + RPC resolve (open→resolved/ignored exactly-once,
--   ghi actor + note). KHÔNG bao giờ auto-credit — giải quyết tiền là quyết định Owner (dùng admin coin
--   adjust có ledger riêng). Additive; service_role-only. Rollback: drop bảng + 2 hàm.
-- ============================================================

create table if not exists public.payment_exceptions (
  id              uuid primary key default gen_random_uuid(),
  provider        public.provider_t not null,
  provider_txn_id text,                          -- ref TOPUP-... (nếu có)
  kind            text not null,                 -- 'amount_mismatch' | 'beneficiary_mismatch' | ...
  paid_vnd        integer,                       -- số tiền provider báo (đã verify chữ ký)
  expected_vnd    integer,                       -- transactions.amount_vnd kỳ vọng (nếu tra được)
  user_id         uuid references public.profiles(id),
  detail          jsonb not null default '{}'::jsonb,  -- metadata redacted (KHÔNG secret/PII thô)
  status          text not null default 'open',
  resolution_note text,
  resolved_by     uuid references public.profiles(id),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  constraint payment_exceptions_status_chk check (status in ('open','resolved','ignored')),
  constraint payment_exceptions_kind_chk check (kind <> '')
);

-- Dedup: cùng provider + ref + kind + paid_vnd → 1 case (webhook retry/replay không nhân bản).
create unique index if not exists payment_exceptions_dedup
  on public.payment_exceptions (provider, coalesce(provider_txn_id, ''), kind, coalesce(paid_vnd, -1));
create index if not exists payment_exceptions_status_idx
  on public.payment_exceptions (status, created_at desc);

-- RLS on, KHÔNG policy client → deny toàn bộ anon/authenticated. Admin đọc qua service_role sau requireAdmin.
alter table public.payment_exceptions enable row level security;
grant select on public.payment_exceptions to service_role;

-- Ghi case (dedup). service_role gọi từ settle sau khi verify chữ ký + phát hiện lệch. KHÔNG credit.
create or replace function public.record_payment_exception(
  p_provider public.provider_t, p_txn_id text, p_kind text,
  p_paid_vnd integer, p_expected_vnd integer, p_user uuid, p_detail jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_inserted boolean := false;
begin
  insert into public.payment_exceptions (provider, provider_txn_id, kind, paid_vnd, expected_vnd, user_id, detail)
  values (p_provider, p_txn_id, p_kind, p_paid_vnd, p_expected_vnd, p_user, coalesce(p_detail, '{}'::jsonb))
  on conflict (provider, coalesce(provider_txn_id, ''), kind, coalesce(paid_vnd, -1)) do nothing
  returning id into v_id;
  if v_id is not null then
    v_inserted := true;
  else
    select id into v_id from public.payment_exceptions
     where provider = p_provider and coalesce(provider_txn_id, '') = coalesce(p_txn_id, '')
       and kind = p_kind and coalesce(paid_vnd, -1) = coalesce(p_paid_vnd, -1);
  end if;
  return jsonb_build_object('id', v_id, 'inserted', v_inserted);
end $$;
revoke all on function public.record_payment_exception(public.provider_t, text, text, integer, integer, uuid, jsonb) from public;
grant execute on function public.record_payment_exception(public.provider_t, text, text, integer, integer, uuid, jsonb) to service_role;

-- Giải quyết case exactly-once: CHỈ đổi khi đang 'open' (idempotent — resolve lần 2 → changed=0).
--   KHÔNG credit ở đây; chỉ ghi quyết định/actor/note để đối soát. Credit thật = admin coin adjust (ledger riêng).
create or replace function public.resolve_payment_exception(
  p_id uuid, p_admin uuid, p_status text, p_note text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  if p_status not in ('resolved', 'ignored') then
    return jsonb_build_object('ok', false, 'reason', 'BAD_STATUS');
  end if;
  update public.payment_exceptions
     set status = p_status, resolution_note = p_note, resolved_by = p_admin, resolved_at = now()
   where id = p_id and status = 'open';
  get diagnostics v_rows = row_count;
  return jsonb_build_object('ok', v_rows = 1, 'changed', v_rows);
end $$;
revoke all on function public.resolve_payment_exception(uuid, uuid, text, text) from public;
grant execute on function public.resolve_payment_exception(uuid, uuid, text, text) to service_role;
