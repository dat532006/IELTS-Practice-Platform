-- ============================================================
-- ADMIN-005 — Xoá đề 2 tầng ATOMIC + có KHOÁ. Trước đây deleteTestTwoTier (TS) đọc tests.status +
--   COUNT(attempts) ở HAI query không khoá, rồi xoá answer_keys/collection_tests/test_unlocks/bookmarks
--   và tests ở NHIỀU transaction PostgREST tách biệt. Hai lỗi:
--     1) TOCTOU: giữa lúc đọc "draft + 0 attempt" và lúc xoá, một publish (draft→published) hoặc
--        start-attempt chen vào → xoá cứng đề vừa published / vừa có người làm (mất dữ liệu, matview trỏ
--        vào test đã bị xoá).
--     2) Cleanup từng phần: nếu delete giữa chừng lỗi → dependents đã xoá nhưng tests còn (đề "hỏng":
--        published/hidden mà mất answer_keys), hoặc ngược lại.
--   Fix: gộp về 1 RPC = 1 transaction, KHOÁ hàng test trước khi quyết định:
--     SELECT status ... FOR UPDATE  → chặn publish (FOR NO KEY UPDATE) VÀ start-attempt (FK KEY SHARE)
--     cho tới COMMIT, nên status + count đọc dưới khoá là ỔN ĐỊNH. Xoá cứng CHỈ khi draft + 0 attempt,
--     và mọi delete dependent + delete tests nằm CHUNG transaction → all-or-nothing (lỗi bất kỳ → rollback
--     sạch, không để lại trạng thái nửa vời). Còn lại → soft-hide (giữ attempt/result học viên cũ).
--   refresh matview KHÔNG đặt trong RPC (refresh ... concurrently không chạy trong transaction block) —
--   caller (TS) refresh sau khi RPC trả action='hidden'. security definer, service_role only (route đã
--   requireAdmin). Rollback: drop function.
-- ============================================================
create or replace function public.admin_delete_test(p_test_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_status text; v_attempts bigint;
begin
  -- KHOÁ hàng test: serialize với publish (UPDATE tests) và start-attempt (INSERT attempts → FK KEY SHARE
  --   trên hàng tests). Sau dòng này, status/count không ai đổi được cho tới khi ta COMMIT/ROLLBACK.
  select status::text into v_status from public.tests where id = p_test_id for update;
  if v_status is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select count(*) into v_attempts from public.attempts where test_id = p_test_id;

  if v_status = 'draft' and v_attempts = 0 then
    -- Xoá cứng: TẤT CẢ trong cùng transaction này → all-or-nothing. answer_keys/collection_tests vốn
    --   ON DELETE CASCADE; test_unlocks/bookmarks là NO ACTION nên xoá tường minh trước khi xoá tests.
    delete from public.answer_keys      where test_id = p_test_id;
    delete from public.collection_tests where test_id = p_test_id;
    delete from public.test_unlocks     where test_id = p_test_id;
    delete from public.bookmarks        where test_id = p_test_id;
    delete from public.tests            where id      = p_test_id;
    return jsonb_build_object('ok', true, 'action', 'deleted');
  end if;

  -- Soft-hide: biến mất khỏi catalog, attempt/result học viên cũ GIỮ NGUYÊN. Idempotent (chạy lại vẫn ok).
  update public.tests set status = 'hidden' where id = p_test_id;
  return jsonb_build_object('ok', true, 'action', 'hidden');
end $$;

revoke all on function public.admin_delete_test(uuid) from public;
grant execute on function public.admin_delete_test(uuid) to service_role;
