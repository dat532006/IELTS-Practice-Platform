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

-- ---------- Check 21 (EXAM-001/TEST-001): listening score_bands = IELTS Academic — FULL 3..40 ----------
-- Fail-closed toàn bảng: mọi raw 3..40 phải map ĐÚNG bằng Reading Academic (bảng chuẩn); raw<3 unmapped.
-- Trước đây chỉ spot-check và MÃ HOÁ giá trị SAI (18→5.5) → false-green. Giờ so từng raw với reading.
do $$
declare cnt int; r int; bl numeric; br numeric;
begin
  select count(*) into cnt from public.score_bands where test_type = 'listening';
  if cnt <> 14 then raise exception 'FAIL check21: listening bands có % dòng (kỳ vọng 14 Academic)', cnt; end if;
  for r in 3..40 loop
    select band into bl from public.score_bands where test_type='listening' and r between raw_min and raw_max;
    select band into br from public.score_bands where test_type='reading'   and r between raw_min and raw_max;
    if bl is null then raise exception 'FAIL check21: listening raw % không map', r; end if;
    if bl is distinct from br then raise exception 'FAIL check21: listening raw % = % nhưng reading = %', r, bl, br; end if;
  end loop;
  -- 4 điểm từng lệch (guard hồi quy tường minh): 18/19→5.0, 26→6.0, 32→7.0.
  if (select band from public.score_bands where test_type='listening' and 18 between raw_min and raw_max) <> 5.0 then raise exception 'FAIL check21: raw 18 != 5.0'; end if;
  if (select band from public.score_bands where test_type='listening' and 19 between raw_min and raw_max) <> 5.0 then raise exception 'FAIL check21: raw 19 != 5.0'; end if;
  if (select band from public.score_bands where test_type='listening' and 26 between raw_min and raw_max) <> 6.0 then raise exception 'FAIL check21: raw 26 != 6.0'; end if;
  if (select band from public.score_bands where test_type='listening' and 32 between raw_min and raw_max) <> 7.0 then raise exception 'FAIL check21: raw 32 != 7.0'; end if;
  perform 1 from public.score_bands where test_type='listening' and 2 between raw_min and raw_max;
  if found then raise exception 'FAIL check21: raw 2 không nên map (kỳ vọng unmapped, raw<3)'; end if;
  raise notice 'PASS check21: listening = Reading Academic toàn bộ raw 3..40 (18/19→5.0, 26→6.0, 32→7.0); raw<3 unmapped';
end $$;

-- ---------- Check 22: client KHÔNG đọc/gọi AI IP rate-limit internals ----------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated; -- FIX (Leader W11): thiếu dòng này → SELECT chạy bằng owner, bypass RLS/grant (false FAIL)
  begin
    perform 1 from public.ai_grade_ip_usage limit 1;
    raise exception 'FAIL check22a: authenticated đọc được ai_grade_ip_usage';
  exception when insufficient_privilege then
    raise notice 'PASS check22a: ai_grade_ip_usage denied to client';
  end;
  begin
    perform public.reserve_ai_grade_ip(repeat('a', 64), 20);
    raise exception 'FAIL check22b: authenticated gọi được reserve_ai_grade_ip';
  exception when insufficient_privilege then
    raise notice 'PASS check22b: reserve_ai_grade_ip denied to client';
  end;
  reset role;
end $$;

-- ============================================================
-- W13 — Admin Product/Bundle published-only RLS (products_select_published).
-- Map docs/ContractForAI/.../W13 + docs/TaskBrief/.../w13.md (draft product KHÔNG lộ client).
-- ============================================================

-- ---------- Check 23: client thấy published product, KHÔNG thấy draft product ----------
do $$
declare pub_seen int; draft_seen int;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into pub_seen   from public.products where id = '00000000-0000-0000-0000-000000000011'; -- pub-prod (published)
  select count(*) into draft_seen from public.products where id = '00000000-0000-0000-0000-000000000012'; -- draft-prod (draft)
  if pub_seen <> 1 then raise exception 'FAIL check23a: client KHÔNG đọc được product published (kỳ vọng 1, got %)', pub_seen; end if;
  if draft_seen <> 0 then raise exception 'FAIL check23b: LEAK draft product cho client (kỳ vọng 0, got %)', draft_seen; end if;
  raise notice 'PASS check23: products_select_published — published lộ, draft ẩn với client';
end $$;

-- ============================================================
-- W15 — Payment/Redeem atomic RPCs (M08): execute-deny client + money logic.
-- Map docs/ContractForAI/.../W15 + payment_redeem_contract §1/§2/§3.
-- ============================================================

-- seed: product trả phí + test premium + mục lục + activation code
insert into public.products (id, slug, title, kind, price_coins, status) values
  ('00000000-0000-0000-0000-000000000051', 'pay-prod', 'Pay Product', 'single', 50, 'published');
insert into public.tests (id, slug, title, type, is_free, status) values
  ('00000000-0000-0000-0000-000000000052', 'pay-test', 'Pay Test', 'reading', false, 'published');
insert into public.collection_tests (product_id, test_id, position) values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000052', 1);
insert into public.activation_codes (id, code_hash, code_prefix, code_last4, product_id, status, max_redemptions, redeemed_count) values
  ('00000000-0000-0000-0000-000000000053', 'w15hash_active_1', 'W15A', 'CT01', '00000000-0000-0000-0000-000000000051', 'active', 1, 0);

-- ---------- Check 24: authenticated KHÔNG execute payment RPC (service_role only) ----------
do $$
begin
  if has_function_privilege('authenticated', 'public.redeem_activation_code(uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.checkout(uuid,uuid[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.credit_topup(public.provider_t,text)', 'EXECUTE')
  then raise exception 'FAIL check24: client execute được payment RPC'; end if;
  if not has_function_privilege('service_role', 'public.checkout(uuid,uuid[])', 'EXECUTE')
  then raise exception 'FAIL check24: service_role KHÔNG execute được checkout'; end if;
  raise notice 'PASS check24: payment RPC execute = service_role only (client denied)';
end $$;

-- ---------- Check 25: redeem atomic — unlock + expand test_unlocks; reuse idempotent (count KHÔNG tăng) ----------
do $$
declare r jsonb; r2 jsonb; tu int; rc int;
begin
  r := public.redeem_activation_code('00000000-0000-0000-0000-00000000000a', 'w15hash_active_1');
  if r->>'status' <> 'OK' then raise exception 'FAIL check25: redeem lần 1 = % (kỳ vọng OK)', r->>'status'; end if;
  select count(*) into tu from public.test_unlocks
   where user_id = '00000000-0000-0000-0000-00000000000a' and test_id = '00000000-0000-0000-0000-000000000052';
  if tu <> 1 then raise exception 'FAIL check25: redeem KHÔNG expand test_unlocks'; end if;
  r2 := public.redeem_activation_code('00000000-0000-0000-0000-00000000000a', 'w15hash_active_1');
  if r2->>'status' <> 'already_unlocked' then raise exception 'FAIL check25: reuse = % (kỳ vọng already_unlocked)', r2->>'status'; end if;
  select redeemed_count into rc from public.activation_codes where id = '00000000-0000-0000-0000-000000000053';
  if rc <> 1 then raise exception 'FAIL check25: redeemed_count = % (reuse KHÔNG được tăng)', rc; end if;
  raise notice 'PASS check25: redeem unlock+expand; reuse idempotent (count=1)';
end $$;

-- ---------- Check 26: checkout atomic — conditional coin + expand; ALREADY_OWNED/INSUFFICIENT KHÔNG trừ ----------
do $$
declare r jsonb; r2 jsonb; r3 jsonb; c int; tu int;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true); -- trigger cho phép update coins
  update public.profiles set coins = 50 where id = '00000000-0000-0000-0000-00000000000b';
  r := public.checkout('00000000-0000-0000-0000-00000000000b', array['00000000-0000-0000-0000-000000000051']::uuid[]);
  if r->>'status' <> 'OK' then raise exception 'FAIL check26: checkout = % (kỳ vọng OK)', r->>'status'; end if;
  select coins into c from public.profiles where id = '00000000-0000-0000-0000-00000000000b';
  if c <> 0 then raise exception 'FAIL check26: coins sau mua = % (kỳ vọng 0)', c; end if;
  select count(*) into tu from public.test_unlocks where user_id = '00000000-0000-0000-0000-00000000000b' and test_id = '00000000-0000-0000-0000-000000000052';
  if tu <> 1 then raise exception 'FAIL check26: checkout KHÔNG expand test_unlocks'; end if;
  -- double → ALREADY_OWNED, KHÔNG trừ thêm
  r2 := public.checkout('00000000-0000-0000-0000-00000000000b', array['00000000-0000-0000-0000-000000000051']::uuid[]);
  if r2->>'status' <> 'ALREADY_OWNED' then raise exception 'FAIL check26: double = % (kỳ vọng ALREADY_OWNED)', r2->>'status'; end if;
  select coins into c from public.profiles where id = '00000000-0000-0000-0000-00000000000b';
  if c <> 0 then raise exception 'FAIL check26: double trừ coin (= %)', c; end if;
  -- insufficient → KHÔNG trừ, KHÔNG unlock (compensate)
  update public.profiles set coins = 10 where id = '00000000-0000-0000-0000-00000000000a';
  r3 := public.checkout('00000000-0000-0000-0000-00000000000a', array['00000000-0000-0000-0000-000000000013']::uuid[]); -- p3-pub giá 100
  if r3->>'status' <> 'INSUFFICIENT_COINS' then raise exception 'FAIL check26: thiếu = % (kỳ vọng INSUFFICIENT_COINS)', r3->>'status'; end if;
  select coins into c from public.profiles where id = '00000000-0000-0000-0000-00000000000a';
  if c <> 10 then raise exception 'FAIL check26: insufficient vẫn trừ coin (= %)', c; end if;
  if exists (select 1 from public.product_unlocks where user_id = '00000000-0000-0000-0000-00000000000a' and product_id = '00000000-0000-0000-0000-000000000013')
  then raise exception 'FAIL check26: insufficient vẫn để lại product_unlock (compensate sai)'; end if;
  reset role;
  raise notice 'PASS check26: checkout conditional coin + expand; ALREADY_OWNED + INSUFFICIENT không trừ/không unlock';
end $$;

-- ---------- Check 27: credit_topup idempotent (UNIQUE provider,txn_id): cộng 1 lần, lặp KHÔNG cộng ----------
do $$
declare r jsonb; r2 jsonb; c int;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update public.profiles set coins = 0 where id = '00000000-0000-0000-0000-00000000000b';
  -- payment/create đã tạo pending topup; webhook credit
  insert into public.transactions (user_id, amount_coins, type, provider, provider_txn_id, status)
  values ('00000000-0000-0000-0000-00000000000b', 200, 'topup', 'vnpay', 'W15-TXN-1', 'pending');
  r := public.credit_topup('vnpay', 'W15-TXN-1');
  if (r->>'credited')::boolean is not true then raise exception 'FAIL check27: topup lần 1 không credited'; end if;
  r2 := public.credit_topup('vnpay', 'W15-TXN-1');
  if (r2->>'credited')::boolean is not false then raise exception 'FAIL check27: topup lặp vẫn credited (double credit)'; end if;
  select coins into c from public.profiles where id = '00000000-0000-0000-0000-00000000000b';
  if c <> 200 then raise exception 'FAIL check27: coins sau topup lặp = % (kỳ vọng 200, cộng 1 lần)', c; end if;
  reset role;
  raise notice 'PASS check27: credit_topup idempotent (cộng 1 lần, lặp txn_id không cộng)';
end $$;

-- ============================================================
-- W17 — M09 Dashboard/History/Vocab own-only (vocab_log / bookmarks).
-- Map docs/TaskBrief/.../phase4/w17.md: dữ liệu cá nhân OWN-ONLY, cross-user deny, with-check chặn ghi hộ.
-- ============================================================

-- ---------- Check 28: vocab_log own-only — A thấy của A, B KHÔNG; with-check chặn ghi hộ user khác ----------
do $$
declare a_cnt int; b_cnt int;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.vocab_log (user_id, word, definition) values
    ('00000000-0000-0000-0000-00000000000a', 'ephemeral', 'lasting a very short time');
  select count(*) into a_cnt from public.vocab_log where word = 'ephemeral';   -- A thấy own → 1
  if a_cnt <> 1 then raise exception 'FAIL check28a: A không thấy vocab của chính mình'; end if;
  -- A KHÔNG được insert vocab cho user B (with check user_id = auth.uid())
  begin
    insert into public.vocab_log (user_id, word) values ('00000000-0000-0000-0000-00000000000b', 'forbidden');
    raise exception 'FAIL check28b: A insert được vocab hộ user B (with-check sai)';
  exception when insufficient_privilege then
    raise notice 'PASS check28b: vocab with-check chặn ghi hộ user khác';
  end;
  reset role;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into b_cnt from public.vocab_log where word = 'ephemeral';   -- B KHÔNG thấy của A → 0
  if b_cnt <> 0 then raise exception 'FAIL check28c: B thấy vocab của A (RLS own-only sai)'; end if;
  reset role;
  raise notice 'PASS check28: vocab_log own-only (A thấy, B không; with-check chặn ghi hộ)';
end $$;

-- ---------- Check 29: bookmarks own-only — B KHÔNG thấy & KHÔNG xóa được bookmark của A ----------
do $$
declare b_seen int; still int;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.bookmarks (user_id, test_id) values
    ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000024')
  on conflict (user_id, test_id) do nothing;
  reset role;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into b_seen from public.bookmarks;                            -- B chỉ thấy own → 0
  if b_seen <> 0 then raise exception 'FAIL check29a: B thấy bookmark của A (kỳ vọng 0, got %)', b_seen; end if;
  delete from public.bookmarks where user_id = '00000000-0000-0000-0000-00000000000a';  -- RLS using → 0 row
  reset role;
  select count(*) into still from public.bookmarks                              -- owner bypass RLS → vẫn còn của A
   where user_id = '00000000-0000-0000-0000-00000000000a'
     and test_id = '00000000-0000-0000-0000-000000000024';
  if still < 1 then raise exception 'FAIL check29b: B xóa được bookmark của A (RLS using sai)'; end if;
  raise notice 'PASS check29: bookmarks own-only (B không thấy & không xóa được của A)';
end $$;

-- ============================================================
-- W18 — Security QA: forge ownership / tamper ledger / sensitive-column deny (data-layer).
-- Map docs/TaskBrief/.../phase4/w18.md 18.1: client KHÔNG forge unlock/txn, KHÔNG tự set plan.
-- ============================================================

-- ---------- Check 30: client KHÔNG insert product_unlocks (forge ownership) ----------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.product_unlocks (user_id, product_id, via)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000011', 'purchase');
    raise exception 'FAIL check30: client forge được product_unlocks (giả sở hữu)';
  exception when insufficient_privilege then
    raise notice 'PASS check30: product_unlocks insert denied to client (unlock chỉ server sau charge/redeem)';
  end;
  reset role;
end $$;

-- ---------- Check 31: client KHÔNG update transactions (tamper ledger coin) ----------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  set local role authenticated;
  begin
    update public.transactions set amount_coins = 999999, status = 'success'
     where user_id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'FAIL check31: client update được transactions (sửa ledger)';
  exception when insufficient_privilege then
    raise notice 'PASS check31: transactions update denied to client (ledger server-only)';
  end;
  reset role;
end $$;

-- ---------- Check 32: client KHÔNG tự set profiles.plan (nâng plan free→pro) — column-grant tier ----------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  -- name update vẫn OK (đã verify check6); plan bị chặn ở column-grant (không grant update(plan))
  begin
    update public.profiles set plan = 'pro' where id = '00000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL check32: client tự nâng profiles.plan (free→pro)';
  exception when insufficient_privilege then
    raise notice 'PASS check32: profiles.plan update denied (column grant — chống tự nâng plan)';
  end;
  reset role;
end $$;

-- ============================================================
-- W19+ — Payment hardening (review F1/F2). Map 20260609000100_payment_hardening_f1_f2.sql.
-- ============================================================

-- ---------- Check 33 (F1/B-03): credit_topup phục hồi topup 'expired' (reconcile dọn) khi webhook hợp lệ đến MUỘN ----------
do $$
declare r jsonb; c int;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update public.profiles set coins = 0 where id = '00000000-0000-0000-0000-00000000000b';
  -- topup pending quá hạn → reconcile đánh 'expired' (B-03: KHÔNG còn dùng 'failed' cho reconcile)
  insert into public.transactions (user_id, amount_coins, type, provider, provider_txn_id, status, expires_at)
  values ('00000000-0000-0000-0000-00000000000b', 80, 'topup', 'bank', 'W19-LATE-1', 'pending', now() - interval '1 hour');
  perform public.expire_pending_topups();
  if (select status from public.transactions where provider = 'bank' and provider_txn_id = 'W19-LATE-1') <> 'expired'
    then raise exception 'FAIL check33: reconcile KHÔNG đánh expired topup quá hạn'; end if;
  -- webhook hợp lệ đến muộn (route đã verify chữ ký + số tiền) → credit_topup phục hồi, KHÔNG mất tiền
  r := public.credit_topup('bank', 'W19-LATE-1');
  if (r->>'credited')::boolean is not true then raise exception 'FAIL check33: webhook muộn KHÔNG credit topup đã expired (mất tiền khách)'; end if;
  select coins into c from public.profiles where id = '00000000-0000-0000-0000-00000000000b';
  if c <> 80 then raise exception 'FAIL check33: coins sau recover = % (kỳ vọng 80)', c; end if;
  -- idempotent: recover xong lặp KHÔNG cộng lại
  if (public.credit_topup('bank', 'W19-LATE-1')->>'credited')::boolean is not false
    then raise exception 'FAIL check33: recover xong vẫn credit lần 2 (double credit)'; end if;
  select coins into c from public.profiles where id = '00000000-0000-0000-0000-00000000000b';
  if c <> 80 then raise exception 'FAIL check33: double credit sau recover (coins=%)', c; end if;
  reset role;
  raise notice 'PASS check33: credit_topup phục hồi topup expired (webhook muộn) idempotent — KHÔNG mất tiền';
end $$;

-- ---------- Check 36 (B-03): topup 'failed' (provider báo thất bại — adapter A1 tương lai) KHÔNG BAO GIỜ credit ----------
do $$
declare c int;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update public.profiles set coins = 0 where id = '00000000-0000-0000-0000-00000000000b';
  insert into public.transactions (user_id, amount_coins, type, provider, provider_txn_id, status)
  values ('00000000-0000-0000-0000-00000000000b', 999, 'topup', 'bank', 'W19-PROVFAIL-1', 'failed');
  if (public.credit_topup('bank', 'W19-PROVFAIL-1')->>'credited')::boolean is not false
    then raise exception 'FAIL check36: credit_topup credit được topup failed (provider-failed) — vi phạm ngữ nghĩa B-03'; end if;
  select coins into c from public.profiles where id = '00000000-0000-0000-0000-00000000000b';
  if c <> 0 then raise exception 'FAIL check36: coins đổi sau credit topup failed (=%)', c; end if;
  if (select status from public.transactions where provider = 'bank' and provider_txn_id = 'W19-PROVFAIL-1') <> 'failed'
    then raise exception 'FAIL check36: status topup failed bị đổi'; end if;
  reset role;
  raise notice 'PASS check36: topup failed (provider) KHÔNG credit được — chỉ expired (reconcile) mới phục hồi';
end $$;

-- ---------- Check 34 (F2): checkout CHỈ mở product published — draft KHÔNG unlock/không trừ coin ----------
do $$
declare c int; puc int;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update public.profiles set coins = 150 where id = '00000000-0000-0000-0000-00000000000b';
  -- ...012 = 'Draft Bundle' (status='draft', giá 100) đã seed đầu file. checkout PHẢI bị chặn.
  perform public.checkout('00000000-0000-0000-0000-00000000000b', array['00000000-0000-0000-0000-000000000012']::uuid[]);
  select coins into c from public.profiles where id = '00000000-0000-0000-0000-00000000000b';
  select count(*) into puc from public.product_unlocks
   where user_id = '00000000-0000-0000-0000-00000000000b' and product_id = '00000000-0000-0000-0000-000000000012';
  if puc <> 0 then raise exception 'FAIL check34: checkout unlock được product DRAFT (rò nội dung chưa phát hành)'; end if;
  if c <> 150 then raise exception 'FAIL check34: checkout draft vẫn trừ coin (coins=%)', c; end if;
  reset role;
  raise notice 'PASS check34: checkout chỉ mở product published (draft ...012 bị chặn, KHÔNG trừ coin)';
end $$;

-- ============================================================
-- W19+ — Review hardening cross-check (R3). Map 20260610000100_profiles_coins_nonneg.sql.
-- ============================================================

-- ---------- Check 35 (R3): CHECK(coins >= 0) — kể cả service_role KHÔNG set coins âm được (defense-in-depth) ----------
do $$
declare c int;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update public.profiles set coins = 5 where id = '00000000-0000-0000-0000-00000000000b';
  begin
    update public.profiles set coins = -1 where id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'FAIL check35: set coins = -1 KHÔNG bị chặn (thiếu CHECK coins>=0)';
  exception when check_violation then
    raise notice 'PASS check35: profiles.coins < 0 bị CHECK chặn (defense-in-depth, mọi role)';
  end;
  select coins into c from public.profiles where id = '00000000-0000-0000-0000-00000000000b';
  if c <> 5 then raise exception 'FAIL check35: coins đổi sau khi set âm bị chặn (=%)', c; end if;
  reset role;
end $$;

-- ============================================================
-- SEC-001 — Ban enforcement (migration 20260714000100). User bị ban KHÔNG ghi được
-- qua RLS dù token còn hạn; is_user_banned() phản ánh auth.users.banned_until.
-- ============================================================

-- ---------- Check 37: is_user_banned() + restrictive RLS chặn write của user bị ban ----------
do $$
declare rc int;
begin
  -- Ban user B (banned_until tương lai). User A KHÔNG ban (control).
  update auth.users set banned_until = now() + interval '1 hour' where id = '00000000-0000-0000-0000-00000000000b';
  update auth.users set banned_until = null where id = '00000000-0000-0000-0000-00000000000a';

  if public.is_user_banned('00000000-0000-0000-0000-00000000000b') is not true
    then raise exception 'FAIL check37: is_user_banned(B) phải TRUE khi banned_until tương lai'; end if;
  if public.is_user_banned('00000000-0000-0000-0000-00000000000a') is not false
    then raise exception 'FAIL check37: is_user_banned(A) phải FALSE (không ban)'; end if;

  -- Banned B: INSERT bookmarks bị RLS with-check chặn (raise).
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.bookmarks (user_id, test_id)
      values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000021');
    raise exception 'FAIL check37: banned B INSERT bookmarks KHÔNG bị chặn';
  exception when insufficient_privilege then
    raise notice 'PASS check37a: banned B insert bookmarks bị RLS chặn';
  end;

  -- Banned B: UPDATE profiles own row → restrictive using chặn → 0 rows.
  update public.profiles set name = 'banned-write' where id = '00000000-0000-0000-0000-00000000000b';
  get diagnostics rc = row_count;
  if rc <> 0 then raise exception 'FAIL check37: banned B update profiles ảnh hưởng % row (phải 0)', rc; end if;
  reset role;

  -- Control: user A (không ban) VẪN ghi vocab_log được.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.vocab_log (user_id, word) values ('00000000-0000-0000-0000-00000000000a', 'control-word');
  get diagnostics rc = row_count;
  if rc <> 1 then raise exception 'FAIL check37: control A insert vocab_log = % row (phải 1)', rc; end if;
  reset role;

  -- Cleanup: gỡ ban B để không ảnh hưởng lần chạy sau (idempotent).
  update auth.users set banned_until = null where id = '00000000-0000-0000-0000-00000000000b';
  raise notice 'PASS check37: ban enforcement (is_user_banned + restrictive RLS) đúng';
end $$;

-- ---------- Check 38 (PAY-004): payment_exceptions deny client (chỉ service_role) ----------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform 1 from public.payment_exceptions limit 1;
    raise exception 'FAIL check38: authenticated đọc được payment_exceptions';
  exception when insufficient_privilege then
    raise notice 'PASS check38: payment_exceptions denied to client (service_role only)';
  end;
  reset role;
end $$;

-- ---------- Check 39 (DEPLOY-001): cron_runs deny client (chỉ service_role) ----------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform 1 from public.cron_runs limit 1;
    raise exception 'FAIL check39: authenticated đọc được cron_runs';
  exception when insufficient_privilege then
    raise notice 'PASS check39: cron_runs denied to client (service_role only)';
  end;
  reset role;
end $$;

select 'ALL RLS SMOKE CHECKS PASSED' as result;

