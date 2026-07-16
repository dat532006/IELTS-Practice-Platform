-- AI-006 — publish guard cho WRITING (Owner báo 2026-07-17).
-- Bug: assert_test_publishable thoát sớm với mọi type ngoài reading/listening → đề writing publish
--   được với prompt RỖNG hoặc thiếu passage; runtime rơi về khớp vị trí → AI chấm task1_prompt=''.
-- Fix: nhánh writing riêng — đúng 2 passage, id task1 + task2 (mỗi id đúng 1 lần), content không rỗng
--   sau khi bóc HTML (&nbsp;/<p><br></p> = rỗng). Writing KHÔNG cần questions/answer_keys → return sau đó.
-- Đề writing ĐÃ published từ trước KHÔNG bị đụng (guard chỉ chạy lúc publish / save-khi-đã-published);
--   form admin đã normalize id về task1/task2 lúc lưu (lib/exam/writing-prompts.ts).
-- Base: bản 20260716000500 (IS DISTINCT FROM null-guard) — copy nguyên phần reading/listening.

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
  v_task text;
  v_cnt int;
  v_content text;
begin
  select type, questions, passages, audio_key
    into v_type, v_questions, v_passages, v_audio_key
    from public.tests
   where id = p_test_id
   for update;

  if not found then
    raise exception 'TEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_type = 'writing' then
    -- passage CHÍNH LÀ đề bài: đúng 2 phần tử, id task1+task2, prompt không rỗng.
    if jsonb_typeof(v_passages) is distinct from 'array' or jsonb_array_length(v_passages) <> 2 then
      raise exception 'INVALID_GRAPH: writing needs exactly 2 passages (task1 + task2)' using errcode = 'P0001';
    end if;
    foreach v_task in array array['task1', 'task2']
    loop
      select count(*) into v_cnt
        from jsonb_array_elements(v_passages) p
       where p->>'id' = v_task;
      if v_cnt <> 1 then
        raise exception 'INVALID_GRAPH: writing passage id % must appear exactly once (found %)', v_task, v_cnt
          using errcode = 'P0001';
      end if;
      select p->>'content' into v_content
        from jsonb_array_elements(v_passages) p
       where p->>'id' = v_task;
      -- Rỗng = rỗng SAU khi bóc tag HTML + &nbsp; (prompt soạn bằng RichTextEditor: '<p><br></p>' là rỗng).
      if btrim(regexp_replace(replace(coalesce(v_content, ''), '&nbsp;', ' '), '<[^>]*>', ' ', 'g')) = '' then
        raise exception 'INVALID_GRAPH: writing prompt % is empty', v_task using errcode = 'P0001';
      end if;
    end loop;
    return; -- writing không cần questions/answer_keys/audio
  end if;

  if v_type not in ('reading', 'listening') then return; end if;

  if jsonb_typeof(v_questions) is distinct from 'array' or jsonb_array_length(v_questions) = 0 then
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
      select 1 from jsonb_array_elements(coalesce(v_passages, '[]'::jsonb)) p where p->>'id' = v_pid
    ) then
      raise exception 'INVALID_GRAPH: missing passage %', v_pid using errcode = 'P0001';
    end if;
  end loop;

  select keys into v_keys from public.answer_keys where test_id = p_test_id;
  if jsonb_typeof(v_keys) is distinct from 'object' then
    raise exception 'INVALID_GRAPH: answer keys required' using errcode = 'P0001';
  end if;

  foreach v_id in array v_ids loop
    if not (v_keys ? v_id) then
      raise exception 'INVALID_GRAPH: missing answer key %', v_id using errcode = 'P0001';
    end if;
  end loop;
  for v_key in select jsonb_object_keys(v_keys) loop
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
