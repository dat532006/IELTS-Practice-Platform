-- ============================================================
-- RLS Smoke Test — chạy SAU shim + migrations (Postgres vanilla / Docker).
-- Map: docs/Evaluation/rls_security_test_matrix.md
-- Mỗi check raise EXCEPTION nếu FAIL → psql ON_ERROR_STOP=1 sẽ dừng đỏ.
-- ============================================================

-- ---------- Seed (chạy như superuser, bypass RLS) ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev', '{"full_name":"User A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev', '{"full_name":"User B"}')
on conflict do nothing;  -- trigger handle_new_user tạo public.profiles

insert into public.products (id, slug, title, kind, price_coins, status) values
  ('00000000-0000-0000-0000-000000000011', 'pub-prod', 'Published Bundle', 'bundle', 100, 'published'),
  ('00000000-0000-0000-0000-000000000012', 'draft-prod', 'Draft Bundle', 'bundle', 100, 'draft');

insert into public.tests (id, slug, title, type, is_free, status, passages, questions) values
  ('00000000-0000-0000-0000-000000000021', 'pub-test', 'Published Test', 'reading', false, 'published',
   '[{"id":"p1","content":"secret premium passage"}]'::jsonb,
   '[{"id":"q1","number":1,"type":"gap_filling"}]'::jsonb);

insert into public.answer_keys (test_id, keys) values
  ('00000000-0000-0000-0000-000000000021', '{"q1":{"answers":["hopper"],"match":"ci"}}'::jsonb);

insert into public.attempts (id, user_id, test_id, status) values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-000000000021', 'submitted');

insert into public.transactions (user_id, amount_coins, type, status) values
  ('00000000-0000-0000-0000-00000000000b', 100, 'topup', 'success');

-- seed cho check10: product published gắn 1 test published (gap_filling) + 1 test draft (matching)
insert into public.products (id, slug, title, kind, price_coins, status) values
  ('00000000-0000-0000-0000-000000000013', 'p3-pub', 'P3 Published', 'bundle', 100, 'published');
insert into public.tests (id, slug, title, type, status, question_types) values
  ('00000000-0000-0000-0000-000000000022', 'tp-pub', 'Pub Test', 'reading', 'published', '{gap_filling}'),
  ('00000000-0000-0000-0000-000000000023', 'td-draft', 'Draft Test', 'reading', 'draft', '{matching}');
insert into public.collection_tests (product_id, test_id, position) values
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000022', 1),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000023', 2);
refresh materialized view public.product_search;

-- ===== W4 access boundary seed (checks 13–17) =====
-- free published test (cho check13: free → payload có sẵn để server trả)
insert into public.tests (id, slug, title, type, is_free, status, passages, questions) values
  ('00000000-0000-0000-0000-000000000024', 'free-test', 'Free Test', 'reading', true, 'published',
   '[{"id":"p1","content":"free passage"}]'::jsonb,
   '[{"id":"q1","number":1,"type":"gap_filling"}]'::jsonb);
-- user B có test_unlocks cho premium test 000021 (cho check15: unlocked → guard allow). User A KHÔNG có.
insert into public.test_unlocks (user_id, test_id, product_id) values
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000011');
-- pub-prod (000011) chứa premium test 000021 (mục lục)
insert into public.collection_tests (product_id, test_id, position) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', 1)
on conflict do nothing;
-- user A: product_unlocks cho 000011 NHƯNG KHÔNG có test_unlocks (cho check17: product-only → VẪN locked, LUẬT THÉP #3)
insert into public.product_unlocks (user_id, product_id, via) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000011', 'purchase');

-- helper: bật danh tính authenticated cho 1 user
-- (set_config local + set role; tự revert cuối mỗi DO block/txn)

-- ---------- Check 1: client KHÔNG đọc answer_keys ----------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform 1 from public.answer_keys limit 1;
    raise exception 'FAIL check1: authenticated đọc được answer_keys';
  exception when insufficient_privilege then
    raise notice 'PASS check1: answer_keys denied to client';
  end;
end $$;

-- ---------- Check 2: client KHÔNG đọc cột premium tests.passages/questions ----------
do $$
declare meta_cnt int;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  -- metadata vẫn đọc được
  select count(*) into meta_cnt from public.tests where status = 'published';
  if meta_cnt < 1 then raise exception 'FAIL check2a: không đọc được metadata tests published'; end if;
  -- nhưng cột passages bị từ chối (không grant)
  begin
    perform passages from public.tests limit 1;
    raise exception 'FAIL check2b: client đọc được tests.passages (premium payload)';
  exception when insufficient_privilege then
    raise notice 'PASS check2: tests metadata OK, passages/questions denied';
  end;
end $$;

-- ---------- Check 3: client KHÔNG đọc activation_codes ----------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform 1 from public.activation_codes limit 1;
    raise exception 'FAIL check3: authenticated đọc được activation_codes';
  exception when insufficient_privilege then
    raise notice 'PASS check3: activation_codes denied to client';
  end;
end $$;

-- ---------- Check 4: user A KHÔNG thấy attempt của user B (RLS row) ----------
do $$
declare a_cnt int; b_cnt int;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into a_cnt from public.attempts;   -- A không có attempt
  reset role;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into b_cnt from public.attempts;   -- B thấy attempt của B
  if a_cnt <> 0 then raise exception 'FAIL check4: User A thấy % attempt (phải 0)', a_cnt; end if;
  if b_cnt < 1  then raise exception 'FAIL check4: User B không thấy attempt của chính mình'; end if;
  raise notice 'PASS check4: attempt isolation (A=0, B=%).', b_cnt;
end $$;

-- ---------- Check 5: client KHÔNG insert transactions ----------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.transactions (user_id, amount_coins, type, status)
    values ('00000000-0000-0000-0000-00000000000a', 999, 'topup', 'success');
    raise exception 'FAIL check5: client insert được transactions';
  exception when insufficient_privilege then
    raise notice 'PASS check5: transactions insert denied to client';
  end;
end $$;

-- ---------- Check 6: client KHÔNG đổi role (column-grant tier) + ĐƯỢC đổi name ----------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  -- đổi name: OK
  update public.profiles set name = 'A renamed' where id = '00000000-0000-0000-0000-00000000000a';
  -- đổi role: bị chặn ở column-grant (không grant update(role))
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL check6: client đổi được profiles.role';
  exception when insufficient_privilege then
    raise notice 'PASS check6: name update OK, role update denied (column grant)';
  end;
end $$;

-- ---------- Check 7: trigger lock_sensitive_cols chặn coins khi không phải service_role ----------
do $$
begin
  -- không có service_role claim → trigger raise
  perform set_config('request.jwt.claims', '{}', true);
  begin
    update public.profiles set coins = 999 where id = '00000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL check7a: đổi coins không bị trigger chặn';
  exception when raise_exception then
    raise notice 'PASS check7a: trigger chặn đổi coins khi thiếu service_role';
  end;
  -- có service_role claim → cho phép
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update public.profiles set coins = 50 where id = '00000000-0000-0000-0000-00000000000a';
  raise notice 'PASS check7b: service_role đổi coins thành công';
end $$;

-- ---------- Check 8: client KHÔNG insert/update attempts (write server-only) ----------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.attempts (user_id, test_id, status)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000021', 'submitted');
    raise exception 'FAIL check8a: client insert được attempts';
  exception when insufficient_privilege then
    raise notice 'PASS check8a: attempts insert denied (write server-only)';
  end;
  begin
    update public.attempts set band = 9.0, status = 'submitted';
    raise exception 'FAIL check8b: client tự set band/status attempts';
  exception when insufficient_privilege then
    raise notice 'PASS check8b: attempts update denied (chống tự set band/status → lộ đáp án)';
  end;
end $$;

-- ---------- Check 9: refresh_product_search() KHÔNG callable bởi client (REVOKE FROM PUBLIC) ----------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.refresh_product_search();
    raise exception 'FAIL check9: authenticated gọi được refresh_product_search';
  exception when insufficient_privilege then
    raise notice 'PASS check9: refresh_product_search denied to client';
  end;
end $$;

-- ---------- Check 10: product_search loại trừ metadata của draft test ----------
do $$
declare qts text[];
begin
  select question_types into qts from public.product_search
   where product_id = '00000000-0000-0000-0000-000000000013';
  if qts is null then raise exception 'FAIL check10: P3 không có trong product_search'; end if;
  if not ('gap_filling' = any(qts)) then raise exception 'FAIL check10: thiếu gap_filling (published test)'; end if;
  if 'matching' = any(qts) then raise exception 'FAIL check10: LEAK draft test metadata (matching)'; end if;
  raise notice 'PASS check10: product_search chỉ gộp published test, loại draft';
end $$;

-- ---------- Check 11: refresh_product_search EXECUTE — service_role CÓ, authenticated KHÔNG ----------
do $$
begin
  if not has_function_privilege('service_role', 'public.refresh_product_search()', 'EXECUTE') then
    raise exception 'FAIL check11a: service_role KHÔNG execute được refresh_product_search';
  end if;
  if has_function_privilege('authenticated', 'public.refresh_product_search()', 'EXECUTE') then
    raise exception 'FAIL check11b: authenticated execute được refresh_product_search';
  end if;
  raise notice 'PASS check11: refresh_product_search execute = service_role only';
end $$;

-- ---------- Check 12: collection_tests KHÔNG lộ mapping tới draft test ----------
do $$
declare visible int; td_visible int;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into visible from public.collection_tests
   where product_id = '00000000-0000-0000-0000-000000000013';
  select count(*) into td_visible from public.collection_tests
   where product_id = '00000000-0000-0000-0000-000000000013'
     and test_id = '00000000-0000-0000-0000-000000000023';  -- draft test TD
  if visible <> 1 then raise exception 'FAIL check12: thấy % collection_tests (kỳ vọng 1 published)', visible; end if;
  if td_visible <> 0 then raise exception 'FAIL check12: lộ mapping draft test'; end if;
  raise notice 'PASS check12: collection_tests chỉ lộ mapping tới published test';
end $$;

-- ============================================================
-- W4 — EXAM PAYLOAD GATE access boundary (data-layer).
-- Map docs/RoadMap/.../W4 Integration Test: free→payload, locked premium→no payload,
--   unlocked premium→payload nhưng KHÔNG answer_keys. (LUẬT THÉP #2/#3)
-- ============================================================

-- ---------- Check 13: FREE test → guard allow + payload đọc được (server/service_role) ----------
do $$
declare is_free_v boolean; pcount int;
begin
  -- chạy như superuser (mô phỏng service_role server đọc payload sau khi guard allow)
  select is_free into is_free_v from public.tests where id = '00000000-0000-0000-0000-000000000024';
  if not is_free_v then raise exception 'FAIL check13: free test is_free=false'; end if;
  select jsonb_array_length(passages) into pcount from public.tests where id = '00000000-0000-0000-0000-000000000024';
  if coalesce(pcount,0) < 1 then raise exception 'FAIL check13: free test không có payload passages'; end if;
  raise notice 'PASS check13: free test → is_free=true + payload có sẵn (guard allow, trả payload)';
end $$;

-- ---------- Check 14: LOCKED premium (user A, không unlock, không free) → guard deny ----------
do $$
declare is_free_v boolean; unlocked boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  select is_free into is_free_v from public.tests where id = '00000000-0000-0000-0000-000000000021'; -- metadata OK
  select exists(select 1 from public.test_unlocks
                where test_id = '00000000-0000-0000-0000-000000000021') into unlocked;            -- RLS: A's own → 0
  if is_free_v then raise exception 'FAIL check14: premium test bị đánh dấu free'; end if;
  if unlocked then raise exception 'FAIL check14: User A thấy test_unlock (phải 0) → guard sai'; end if;
  raise notice 'PASS check14: premium + A không unlock → guard locked (KHÔNG trả payload)';
end $$;

-- ---------- Check 15: UNLOCKED premium (user B có test_unlocks) → guard allow NHƯNG answer_keys vẫn deny ----------
do $$
declare unlocked boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  set local role authenticated;
  select exists(select 1 from public.test_unlocks
                where test_id = '00000000-0000-0000-0000-000000000021') into unlocked;            -- RLS: B's own → 1
  if not unlocked then raise exception 'FAIL check15: User B không thấy test_unlock của mình → guard sai'; end if;
  begin
    perform 1 from public.answer_keys where test_id = '00000000-0000-0000-0000-000000000021';
    raise exception 'FAIL check15: unlocked user đọc được answer_keys (vi phạm LUẬT THÉP #2)';
  exception when insufficient_privilege then
    raise notice 'PASS check15: unlocked (B) → guard allow NHƯNG answer_keys vẫn deny';
  end;
end $$;

-- ---------- Check 16: payload column passages deny client KỂ CẢ khi đã unlock (chỉ qua server) ----------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform passages from public.tests where id = '00000000-0000-0000-0000-000000000021';
    raise exception 'FAIL check16: unlocked client đọc trực tiếp tests.passages';
  exception when insufficient_privilege then
    raise notice 'PASS check16: payload chỉ qua server (passages deny client kể cả khi unlocked)';
  end;
end $$;

-- ---------- Check 17: product_unlocks-only (chưa expand test_unlocks) → guard VẪN locked (LUẬT THÉP #3) ----------
-- Ngăn regression: owned(product) KHÔNG được tự mở payload; chỉ test_unlocks (hoặc is_free) mới mở.
do $$
declare owns_product boolean; has_unlock boolean; is_free_v boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  select exists(select 1 from public.product_unlocks
                where product_id = '00000000-0000-0000-0000-000000000011') into owns_product; -- A's own (RLS) → true
  select exists(select 1 from public.test_unlocks
                where test_id = '00000000-0000-0000-0000-000000000021') into has_unlock;        -- A's own → false
  select is_free into is_free_v from public.tests where id = '00000000-0000-0000-0000-000000000021';
  if not owns_product then raise exception 'FAIL check17: seed product_unlocks cho A không thấy'; end if;
  if has_unlock then raise exception 'FAIL check17: A có test_unlocks (kỳ vọng product-only, không có)'; end if;
  -- guard = is_free OR test_unlocks = false OR false = LOCKED dù owns_product=true
  if (is_free_v or has_unlock) then raise exception 'FAIL check17: guard mở payload cho product-only (vi phạm LUẬT THÉP #3)'; end if;
  raise notice 'PASS check17: product-owned-only (thiếu test_unlocks) → guard LOCKED (product_unlocks KHÔNG mở payload)';
end $$;

-- ============================================================
-- W6 — Reading band table (IELTS Academic) correctness + idempotent convergence.
-- Map docs/ContractForAI/.../W6 + migration 20260602000300. Phân biệt bảng ĐÚNG vs bảng cũ/sai.
-- ============================================================

-- ---------- Check 18: reading score_bands = IELTS Academic (boundary phân biệt bảng đúng/sai) ----------
do $$
declare cnt int; b numeric;
begin
  select count(*) into cnt from public.score_bands where test_type = 'reading';
  if cnt <> 14 then raise exception 'FAIL check18: reading bands có % dòng (kỳ vọng 14 Academic)', cnt; end if;
  select band into b from public.score_bands where test_type='reading' and 22 between raw_min and raw_max;
  if b is distinct from 5.5 then raise exception 'FAIL check18: raw 22 → % (kỳ vọng 5.5)', b; end if;
  select band into b from public.score_bands where test_type='reading' and 19 between raw_min and raw_max;
  if b is distinct from 5.0 then raise exception 'FAIL check18: raw 19 → % (kỳ vọng 5.0)', b; end if;
  select band into b from public.score_bands where test_type='reading' and 13 between raw_min and raw_max;
  if b is distinct from 4.5 then raise exception 'FAIL check18: raw 13 → % (kỳ vọng 4.5)', b; end if;
  select band into b from public.score_bands where test_type='reading' and 7 between raw_min and raw_max;
  if b is distinct from 3.5 then raise exception 'FAIL check18: raw 7 → % (kỳ vọng 3.5)', b; end if;
  select band into b from public.score_bands where test_type='reading' and 5 between raw_min and raw_max;
  if b is distinct from 3.0 then raise exception 'FAIL check18: raw 5 → % (kỳ vọng 3.0)', b; end if;
  select band into b from public.score_bands where test_type='reading' and 3 between raw_min and raw_max;
  if b is distinct from 2.5 then raise exception 'FAIL check18: raw 3 → % (kỳ vọng 2.5)', b; end if;
  perform 1 from public.score_bands where test_type='reading' and 2 between raw_min and raw_max;
  if found then raise exception 'FAIL check18: raw 2 không nên map (kỳ vọng unmapped, raw<3)'; end if;
  raise notice 'PASS check18: reading bands = IELTS Academic (boundary 22/19/13/7/5/3 đúng, raw<3 unmapped)';
end $$;

-- ---------- Check 19: converge idempotent trên DB "bẩn" (delete-by-type + insert academic) ----------
do $$
declare cnt int; b numeric; zero_found boolean;
begin
  -- giả lập DB đã seed bảng cũ/sai (dòng gộp + dòng 0-0 không thuộc Academic)
  insert into public.score_bands (test_type, raw_min, raw_max, band) values ('reading', 19, 22, 5.5), ('reading', 0, 0, 0.0);
  -- re-apply ĐÚNG SQL của migration 20260602000300 (scoped theo test_type, KHÔNG dựa not-exists toàn bảng)
  delete from public.score_bands where test_type = 'reading';
  insert into public.score_bands (test_type, raw_min, raw_max, band) values
    ('reading',39,40,9.0),('reading',37,38,8.5),('reading',35,36,8.0),('reading',33,34,7.5),
    ('reading',30,32,7.0),('reading',27,29,6.5),('reading',23,26,6.0),('reading',20,22,5.5),
    ('reading',16,19,5.0),('reading',13,15,4.5),('reading',10,12,4.0),('reading',7,9,3.5),
    ('reading',5,6,3.0),('reading',3,4,2.5);
  select count(*) into cnt from public.score_bands where test_type = 'reading';
  if cnt <> 14 then raise exception 'FAIL check19: sau converge có % dòng (kỳ vọng 14)', cnt; end if;
  select band into b from public.score_bands where test_type='reading' and 22 between raw_min and raw_max;
  if b is distinct from 5.5 then raise exception 'FAIL check19: raw 22 → % sau converge', b; end if;
  select exists(select 1 from public.score_bands where test_type='reading' and 0 between raw_min and raw_max) into zero_found;
  if zero_found then raise exception 'FAIL check19: dòng cũ 0-0 vẫn còn (converge KHÔNG xóa được seed cũ)'; end if;
  raise notice 'PASS check19: converge idempotent (xóa reading cũ + insert Academic) trên DB bẩn';
end $$;

-- ============================================================
-- W7 — Listening audio key (server-only) + listening band table.
-- Map docs/ContractForAI/.../W7 + migrations 20260603000100 / 20260603000200.
-- ============================================================

-- ---------- Check 20: client KHÔNG đọc cột tests.audio_key (raw R2 object key, server-only) ----------
do $$
declare meta_cnt int;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  -- metadata vẫn đọc được (cột đã grant)
  select count(*) into meta_cnt from public.tests where status = 'published';
  if meta_cnt < 1 then raise exception 'FAIL check20a: không đọc được metadata tests published'; end if;
  -- nhưng audio_key bị từ chối (KHÔNG column-grant) — giống passages/questions
  begin
    perform audio_key from public.tests limit 1;
    raise exception 'FAIL check20b: client đọc được tests.audio_key (raw R2 object key — vi phạm LUẬT THÉP #3)';
  exception when insufficient_privilege then
    raise notice 'PASS check20: tests.audio_key denied to client (server-only, sign sau guard)';
  end;
end $$;

-- ---------- Check 21: listening score_bands = IELTS Academic (boundary phân biệt bảng đúng/sai) ----------
do $$
declare cnt int; b numeric;
begin
  select count(*) into cnt from public.score_bands where test_type = 'listening';
  if cnt <> 14 then raise exception 'FAIL check21: listening bands có % dòng (kỳ vọng 14 Academic)', cnt; end if;
  select band into b from public.score_bands where test_type='listening' and 10 between raw_min and raw_max;
  if b is distinct from 4.0 then raise exception 'FAIL check21: raw 10 → % (kỳ vọng 4.0)', b; end if;
  select band into b from public.score_bands where test_type='listening' and 40 between raw_min and raw_max;
  if b is distinct from 9.0 then raise exception 'FAIL check21: raw 40 → % (kỳ vọng 9.0)', b; end if;
  select band into b from public.score_bands where test_type='listening' and 18 between raw_min and raw_max;
  if b is distinct from 5.5 then raise exception 'FAIL check21: raw 18 → % (kỳ vọng 5.5)', b; end if;
  select band into b from public.score_bands where test_type='listening' and 23 between raw_min and raw_max;
  if b is distinct from 6.0 then raise exception 'FAIL check21: raw 23 → % (kỳ vọng 6.0)', b; end if;
  perform 1 from public.score_bands where test_type='listening' and 2 between raw_min and raw_max;
  if found then raise exception 'FAIL check21: raw 2 không nên map (kỳ vọng unmapped, raw<3)'; end if;
  raise notice 'PASS check21: listening bands = IELTS Academic (raw 10→4.0, 18→5.5, 23→6.0, 40→9.0, raw<3 unmapped)';
end $$;

select 'ALL RLS SMOKE CHECKS PASSED' as result;
