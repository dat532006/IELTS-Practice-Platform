-- ============================================================
-- ADMIN-010 — Đổi thứ tự đề trong product (VOL) ATOMIC. Trước đây UI gọi HAI request bind (POST
--   collection_tests) tuần tự để swap position và BỎ QUA kết quả từng cái: nếu request thứ 2 fail
--   (500/mạng, KHÔNG throw) → swap NỬA VỜI → hai đề CÙNG position (position không unique) mà UI vẫn báo
--   thành công. Fix: 1 RPC = 1 transaction hoán đổi position của 2 đề (khoá FOR UPDATE) → không bao giờ
--   để lại trạng thái nửa vời / trùng position. service_role only (route requireAdmin).
--   Rollback: drop function (UI quay lại 2 bind — nhưng nên giữ).
-- ============================================================
create or replace function public.reorder_product_tests(p_product_id uuid, p_test_a uuid, p_test_b uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pa integer; pb integer;
begin
  -- Khoá cả hai hàng để swap nhất quán dưới đua (2 admin cùng kéo-thả).
  select position into pa from public.collection_tests where product_id = p_product_id and test_id = p_test_a for update;
  select position into pb from public.collection_tests where product_id = p_product_id and test_id = p_test_b for update;
  if pa is null or pb is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  update public.collection_tests set position = pb where product_id = p_product_id and test_id = p_test_a;
  update public.collection_tests set position = pa where product_id = p_product_id and test_id = p_test_b;
  return jsonb_build_object('ok', true, 'pos_a', pb, 'pos_b', pa);
end $$;

revoke all on function public.reorder_product_tests(uuid, uuid, uuid) from public;
grant execute on function public.reorder_product_tests(uuid, uuid, uuid) to service_role;
