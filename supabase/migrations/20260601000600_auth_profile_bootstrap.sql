-- ============================================================
-- W1+2 Backend — Profile bootstrap từ auth.users
-- Khi user đăng ký (Google/email) → tạo public.profiles tương ứng.
-- SECURITY DEFINER để insert vượt RLS một cách kiểm soát.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, avatar)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Definer function: chặn gọi trực tiếp từ client (trigger vẫn fire bình thường)
revoke all on function public.handle_new_user() from public;
