-- ============================================================
-- Account page (M11) — Avatars storage bucket.
-- Bucket PUBLIC 'avatars' cho ảnh đại diện người dùng. Read công khai (ảnh hiển thị mọi nơi),
-- ghi CHỈ trong thư mục của chính mình: path = '<auth.uid()>/<file>'. Additive, idempotent.
--
-- ⚠️ Bọc trong guard: schema `storage` do Supabase Storage cung cấp. Trên hosted Supabase nó LUÔN tồn tại,
--    nhưng ở môi trường không bật Storage (vd local tắt storage) thì `storage.buckets` vắng mặt →
--    migration phải NO-OP thay vì làm hỏng cả `db reset`. Do đó check to_regclass trước khi tạo.
-- Rollback: delete from storage.buckets where id='avatars';  (+ drop 4 policy 'avatars_*' trên storage.objects)
-- ============================================================
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'schema storage chưa có (Storage chưa bật) — bỏ qua thiết lập bucket avatars';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- Read: ai cũng xem được (bucket public).
  execute $p$drop policy if exists "avatars_public_read" on storage.objects$p$;
  execute $p$create policy "avatars_public_read" on storage.objects
            for select using (bucket_id = 'avatars')$p$;

  -- Insert: authenticated, chỉ vào thư mục '<uid>/...'.
  execute $p$drop policy if exists "avatars_owner_insert" on storage.objects$p$;
  execute $p$create policy "avatars_owner_insert" on storage.objects
            for insert to authenticated
            with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  -- Update: chỉ file trong thư mục của mình (cho upsert đè ảnh cũ).
  execute $p$drop policy if exists "avatars_owner_update" on storage.objects$p$;
  execute $p$create policy "avatars_owner_update" on storage.objects
            for update to authenticated
            using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
            with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  -- Delete: chỉ file trong thư mục của mình.
  execute $p$drop policy if exists "avatars_owner_delete" on storage.objects$p$;
  execute $p$create policy "avatars_owner_delete" on storage.objects
            for delete to authenticated
            using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
end $$;
