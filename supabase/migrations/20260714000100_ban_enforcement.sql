-- ============================================================
-- SEC-001 — Ban enforcement on issued tokens.
-- Vấn đề: ban qua Supabase Auth chỉ chặn LOGIN/refresh; access token đã phát vẫn còn hạn (~1h)
--   nên user bị ban vẫn chạm tới protected operations (server routes qua service_role, và direct
--   PostgREST write). Fix theo 2 lớp:
--     (1) DB-authoritative: hàm is_user_banned() đọc auth.users.banned_until (nguồn sự thật, tự
--         đồng bộ với ban route — không cần mirror), + restrictive RLS trên bảng client-writable.
--     (2) Server guard (lib/auth/guards.ts) gọi is_user_banned() sau getUser() → deny 401 mọi route.
-- Additive & mixed-version safe: policy restrictive chỉ SIẾT thêm; deploy DB trước server guard.
-- Rollback: drop 4 policy restrictive + hàm; hành vi trở lại như cũ (token-only). Không phá dữ liệu.
-- ============================================================

-- 1) Nguồn sự thật ban: đọc auth.users.banned_until. SECURITY DEFINER để client role đọc được
--    (authenticated không có quyền select auth.users). STABLE: cache trong 1 statement.
create or replace function public.is_user_banned(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (select u.banned_until is not null and u.banned_until > now()
       from auth.users u
      where u.id = uid),
    false
  );
$$;

-- Chặn gọi tùy tiện từ public; chỉ role thật của app được execute (đủ cho RLS + server RPC).
revoke all on function public.is_user_banned(uuid) from public;
grant execute on function public.is_user_banned(uuid) to authenticated, anon, service_role;

-- 2) Restrictive RLS: siết THÊM (AND) lên policy permissive sẵn có. User bị ban không ghi được.
--    profiles: chỉ chặn UPDATE (giữ SELECT để guard/app đọc profile bình thường).
create policy profiles_block_banned_update on public.profiles
  as restrictive for update to authenticated
  using (not public.is_user_banned(auth.uid()))
  with check (not public.is_user_banned(auth.uid()));

--    cart_items / bookmarks / vocab_log: dữ liệu cá nhân — chặn TOÀN BỘ thao tác khi bị ban.
create policy cart_items_block_banned on public.cart_items
  as restrictive for all to authenticated
  using (not public.is_user_banned(auth.uid()))
  with check (not public.is_user_banned(auth.uid()));
create policy bookmarks_block_banned on public.bookmarks
  as restrictive for all to authenticated
  using (not public.is_user_banned(auth.uid()))
  with check (not public.is_user_banned(auth.uid()));
create policy vocab_log_block_banned on public.vocab_log
  as restrictive for all to authenticated
  using (not public.is_user_banned(auth.uid()))
  with check (not public.is_user_banned(auth.uid()));
