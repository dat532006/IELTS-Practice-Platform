-- ============================================================
-- ADMIN-003 — Atomic test + answer_keys write. Trước đây create/update ghi tests rồi upsert answer_keys
--   ở HAI transaction PostgREST tách biệt → lỗi giữa chừng để test không có/lệch key; và "xoá hết đáp án"
--   (answer_keys undefined) giữ key CŨ (stale). Fix: 1 RPC = 1 transaction. Intent key TƯỜNG MINH:
--   p_replace_keys=false → giữ nguyên; true + p_keys rỗng/null → XOÁ; true + p_keys → THAY. security definer,
--   service_role only (route đã requireAdmin). Rollback: drop function.
-- ============================================================
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
      p_row->>'title',
      (p_row->>'type')::public.test_type_t,
      nullif(p_row->>'slug', ''),
      p_row->>'source',
      coalesce((p_row->>'is_free')::boolean, false),
      nullif(p_row->>'difficulty', '')::smallint,
      nullif(p_row->>'duration_sec', '')::int,
      v_qtypes,
      coalesce(p_row->'passages', '[]'::jsonb),
      coalesce(p_row->'questions', '[]'::jsonb),
      'draft'
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
      delete from public.answer_keys where test_id = v_id;   -- clear
    else
      insert into public.answer_keys (test_id, keys) values (v_id, p_keys)
      on conflict (test_id) do update set keys = excluded.keys;  -- replace
    end if;
  end if;

  return jsonb_build_object('ok', true, 'test_id', v_id, 'status', v_status);
end $$;

revoke all on function public.admin_save_test(uuid, jsonb, jsonb, boolean) from public;
grant execute on function public.admin_save_test(uuid, jsonb, jsonb, boolean) to service_role;
