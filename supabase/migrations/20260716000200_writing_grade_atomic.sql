-- EXAM-002: recoverable idempotency claims and atomic Writing finalization.

alter table public.writing_submissions
  add column if not exists claim_token uuid,
  add column if not exists claimed_at timestamptz;

create or replace function public.claim_writing_grade(
  p_attempt uuid,
  p_user uuid,
  p_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.attempt_status_t;
  v_rows integer;
begin
  select status into v_status
    from public.attempts
   where id = p_attempt and user_id = p_user
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'code', 'ATTEMPT_TERMINAL');
  end if;

  -- Provider calls are bounded below five minutes. A ten-minute lease permits
  -- recovery after process death while preventing a live request being stolen.
  delete from public.writing_submissions
   where attempt_id = p_attempt
     and user_id = p_user
     and ai_score is null
     and coalesce(claimed_at, '-infinity'::timestamptz) < now() - interval '10 minutes';

  insert into public.writing_submissions (attempt_id, user_id, ai_score, claim_token, claimed_at)
  values (p_attempt, p_user, null, p_claim_token, now())
  on conflict (attempt_id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows <> 1 then
    return jsonb_build_object('ok', false, 'code', 'GRADING_CONFLICT');
  end if;
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.claim_writing_grade(uuid, uuid, uuid) from public;
grant execute on function public.claim_writing_grade(uuid, uuid, uuid) to service_role;

create or replace function public.finalize_writing_grade(
  p_attempt uuid,
  p_user uuid,
  p_claim_token uuid,
  p_task1_text text,
  p_task2_text text,
  p_task1_wc integer,
  p_task2_wc integer,
  p_ai_score jsonb,
  p_graded_at timestamptz,
  p_band numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.attempt_status_t;
  v_rows integer;
begin
  select status into v_status
    from public.attempts
   where id = p_attempt and user_id = p_user
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'code', 'ATTEMPT_TERMINAL');
  end if;

  update public.writing_submissions
     set task1_text = p_task1_text,
         task2_text = p_task2_text,
         task1_wc = p_task1_wc,
         task2_wc = p_task2_wc,
         ai_score = p_ai_score,
         graded_at = p_graded_at,
         claim_token = null
   where attempt_id = p_attempt
     and user_id = p_user
     and claim_token = p_claim_token
     and ai_score is null;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    return jsonb_build_object('ok', false, 'code', 'GRADING_CONFLICT');
  end if;

  update public.attempts
     set status = 'submitted',
         submitted_at = p_graded_at,
         band = p_band
   where id = p_attempt
     and user_id = p_user
     and status = 'in_progress';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'WRITING_FINALIZE_RACE' using errcode = '40001';
  end if;

  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.finalize_writing_grade(uuid, uuid, uuid, text, text, integer, integer, jsonb, timestamptz, numeric) from public;
grant execute on function public.finalize_writing_grade(uuid, uuid, uuid, text, text, integer, integer, jsonb, timestamptz, numeric) to service_role;
