-- PAY-004 follow-up: break the audit FK delete cycle while retaining links.
alter table public.payment_exceptions
  drop constraint if exists payment_exceptions_ledger_txn_id_fkey,
  add constraint payment_exceptions_ledger_txn_id_fkey
    foreign key (ledger_txn_id) references public.transactions(id) on delete set null;

alter table public.transactions
  drop constraint if exists transactions_payment_exception_id_fkey,
  add constraint transactions_payment_exception_id_fkey
    foreign key (payment_exception_id) references public.payment_exceptions(id) on delete set null;
