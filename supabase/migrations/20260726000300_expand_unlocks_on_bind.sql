-- BUG: mua bộ đề xong, đề GẮN THÊM SAU vẫn bị khoá.
--
-- Cơ chế truy cập (LUẬT THÉP #3) chỉ đọc `test_unlocks`. Lúc mua, `checkout` chèn test_unlocks theo
--   ẢNH CHỤP `collection_tests` tại thời điểm đó. Về sau admin gắn thêm đề vào bộ (addTestToProduct →
--   upsert collection_tests) thì KHÔNG ai bơm test_unlocks cho người đã mua → họ thấy "Khóa".
--   Đường cấp quyền admin (admin_grant_products) đã expand đúng từ trước; chỉ đường GẮN ĐỀ bỏ sót.
--
-- Sửa 2 phần:
--   1) RPC expand_product_test_unlocks — bơm unlock cho MỌI chủ sở hữu của product theo danh sách đề
--      HIỆN TẠI. Idempotent (on conflict do nothing) → gọi lại bao nhiêu lần cũng an toàn.
--   2) Backfill MỘT LẦN cho toàn bộ product đang có, vá những người đã mua và đang bị khoá oan.
--
-- KHÔNG đụng chiều ngược lại: gỡ đề khỏi bộ KHÔNG thu hồi test_unlocks — người đã mua giữ nguyên
--   những gì họ từng được mở (đổi thành thu hồi là quyết định kinh doanh, không phải sửa lỗi).

create or replace function public.expand_product_test_unlocks(p_product_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  insert into public.test_unlocks (user_id, test_id, product_id)
  select pu.user_id, ct.test_id, ct.product_id
    from public.product_unlocks pu
    join public.collection_tests ct on ct.product_id = pu.product_id
   where pu.product_id = p_product_id
  on conflict (user_id, test_id, product_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Client roles KHÔNG execute (chỉ service_role qua route đã requireAdmin).
revoke all on function public.expand_product_test_unlocks(uuid) from public, anon, authenticated;
grant execute on function public.expand_product_test_unlocks(uuid) to service_role;

-- Backfill một lần: mọi chủ sở hữu × mọi đề hiện có trong bộ họ sở hữu.
insert into public.test_unlocks (user_id, test_id, product_id)
select pu.user_id, ct.test_id, ct.product_id
  from public.product_unlocks pu
  join public.collection_tests ct on ct.product_id = pu.product_id
on conflict (user_id, test_id, product_id) do nothing;
