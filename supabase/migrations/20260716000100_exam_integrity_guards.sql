-- ADMIN-002 / EXAM-009: enforce publishability in the database and snapshot
-- every scoring input in the same transaction that creates an attempt.

alter table public.attempt_content_snapshots
  add column if not exists answer_keys jsonb,
  add column if not exists test_title text,
  add column if not exists test_type public.test_type_t,
  add column if not exists audio_key text;

create or replace function public.assert_test_publishable(p_test_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.test_type_t;
  v_questions jsonb;
  v_passages jsonb;
  v_audio_key text;
  v_keys jsonb;
  v_q jsonb;
  v_id text;
  v_pid text;
  v_key text;
  v_ids text[] := array[]::text[];
begin
  select type, questions, passages, audio_key
    into v_type, v_questions, v_passages, v_audio_key
    from public.tests
   where id = p_test_id
   for update;

  if not found then
    raise exception 'TEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_type not in ('reading', 'listening') then
    return;
  end if;

  if jsonb_typeof(v_questions) <> 'array' or jsonb_array_length(v_questions) = 0 then
    raise exception 'INVALID_GRAPH: questions required' using errcode = 'P0001';
  end if;

  for v_q in select value from jsonb_array_elements(v_questions)
  loop
    v_id := nullif(btrim(v_q->>'id'), '');
    if v_id is null then
      raise exception 'INVALID_GRAPH: question id required' using errcode = 'P0001';
    end if;
    if v_id = any(v_ids) then
      raise exception 'INVALID_GRAPH: duplicate question id %', v_id using errcode = 'P0001';
    end if;
    v_ids := array_append(v_ids, v_id);

    v_pid := nullif(btrim(v_q->>'passage_id'), '');
    if v_pid is not null and not exists (
      select 1
        from jsonb_array_elements(coalesce(v_passages, '[]'::jsonb)) p
       where p->>'id' = v_pid
    ) then
      raise exception 'INVALID_GRAPH: missing passage %', v_pid using errcode = 'P0001';
    end if;
  end loop;

  select keys into v_keys from public.answer_keys where test_id = p_test_id;
  if jsonb_typeof(v_keys) <> 'object' then
    raise exception 'INVALID_GRAPH: answer keys required' using errcode = 'P0001';
  end if;

  foreach v_id in array v_ids
  loop
    if not (v_keys ? v_id) then
      raise exception 'INVALID_GRAPH: missing answer key %', v_id using errcode = 'P0001';
    end if;
  end loop;

  for v_key in select jsonb_object_keys(v_keys)
  loop
    if not (v_key = any(v_ids)) then
      raise exception 'INVALID_GRAPH: extra answer key %', v_key using errcode = 'P0001';
    end if;
  end loop;

  if v_type = 'listening' and nullif(btrim(v_audio_key), '') is null then
    raise exception 'INVALID_GRAPH: listening audio required' using errcode = 'P0001';
  end if;
end
$$;

revoke all on function public.assert_test_publishable(uuid) from public;
grant execute on function public.assert_test_publishable(uuid) to service_role;

create or replace function public.admin_publish_test(p_test_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_test_publishable(p_test_id);
  update public.tests set status = 'published' where id = p_test_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'test_id', p_test_id, 'status', 'published');
exception
  when no_data_found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
end
$$;

revoke all on function public.admin_publish_test(uuid) from public;
grant execute on function public.admin_publish_test(uuid) to service_role;

-- Re-declare admin_save_test in a later migration. If the row was already
-- published, validate after all test/key writes. Any exception rolls back the
-- entire RPC transaction.
create or replace function public.admin_save_test(
  p_id uuid, p_row jsonb, p_keys jsonb, p_replace_keys boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_status text; v_qtypes text[];
begin
  if p_row ? 'question_types' and jsonb_typeof(p_row->'question_types') = 'array' then
    select array_agg(x) into v_qtypes from jsonb_array_elements_text(p_row->'question_types') x;
  else
    v_qtypes := null;
  end if;

  if p_id is null then
    insert into public.tests (title, type, slug, source, is_free, difficulty, duration_sec, question_types, passages, questions, status)
    values (
      p_row->>'title', (p_row->>'type')::public.test_type_t, nullif(p_row->>'slug', ''),
      p_row->>'source', coalesce((p_row->>'is_free')::boolean, false),
      nullif(p_row->>'difficulty', '')::smallint, nullif(p_row->>'duration_sec', '')::int,
      v_qtypes, coalesce(p_row->'passages', '[]'::jsonb),
      coalesce(p_row->'questions', '[]'::jsonb), 'draft'
    )
    returning id, status::text into v_id, v_status;
  else
    update public.tests set
      title = p_row->>'title',
      type = (p_row->>'type')::public.test_type_t,
      slug = nullif(p_row->>'slug', ''),
      source = p_row->>'source',
      is_free = coalesce((p_row->>'is_free')::boolean, false),
      difficulty = nullif(p_row->>'difficulty', '')::smallint,
      duration_sec = nullif(p_row->>'duration_sec', '')::int,
      question_types = v_qtypes,
      passages = coalesce(p_row->'passages', '[]'::jsonb),
      questions = coalesce(p_row->'questions', '[]'::jsonb)
    where id = p_id
    returning id, status::text into v_id, v_status;
    if v_id is null then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
  end if;

  if p_replace_keys then
    if p_keys is null or p_keys = '{}'::jsonb then
      delete from public.answer_keys where test_id = v_id;
    else
      insert into public.answer_keys (test_id, keys) values (v_id, p_keys)
      on conflict (test_id) do update set keys = excluded.keys;
    end if;
  end if;

  if v_status = 'published' then
    perform public.assert_test_publishable(v_id);
  end if;

  return jsonb_build_object('ok', true, 'test_id', v_id, 'status', v_status);
end $$;

revoke all on function public.admin_save_test(uuid, jsonb, jsonb, boolean) from public;
grant execute on function public.admin_save_test(uuid, jsonb, jsonb, boolean) to service_role;

create or replace function public.capture_attempt_snapshot_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.attempt_content_snapshots (
    attempt_id, test_id, passages, questions, answer_keys,
    test_title, test_type, audio_key
  )
  select new.id, new.test_id, t.passages, t.questions, ak.keys,
         t.title, t.type, t.audio_key
    from public.tests t
    left join public.answer_keys ak on ak.test_id = t.id
   where t.id = new.test_id;
  return new;
end
$$;

drop trigger if exists attempts_capture_content_snapshot on public.attempts;
create trigger attempts_capture_content_snapshot
after insert on public.attempts
for each row execute function public.capture_attempt_snapshot_trigger();

revoke all on function public.capture_attempt_snapshot_trigger() from public;
