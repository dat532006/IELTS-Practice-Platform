-- ============================================================
-- 2026-07-12 — tests.cover_image (ảnh minh họa đề, PUBLIC metadata) + bucket 'media'.
--
-- cover_image = URL công khai ảnh minh họa cho trang pre-exam /tests/[id]. KHÁC audio_key:
--   audio_key là premium/server-only (KHÔNG grant client); cover_image là metadata CÔNG KHAI
--   (hiện trên trang marketing) → PHẢI column-grant cho anon/authenticated để getTestMeta đọc.
-- Ảnh lưu ở Supabase Storage bucket public 'media' (upload qua /api/admin/media, service_role).
-- Additive & idempotent. Rollback:
--   alter table public.tests drop column if exists cover_image;
--   revoke select (cover_image) on public.tests from anon, authenticated;
--   delete from storage.buckets where id='media';  (+ drop policy 'media_public_read')
-- ============================================================

alter table public.tests add column if not exists cover_image text;

comment on column public.tests.cover_image is
  'URL công khai ảnh minh họa đề (Supabase Storage bucket media). PUBLIC metadata — an toàn lộ client.';

-- Column-grant: cùng nhóm cột metadata public (migration 000400). KHÔNG đụng passages/questions/audio_key.
grant select (cover_image) on public.tests to anon, authenticated;

-- Bucket PUBLIC 'media' cho ảnh minh họa đề (và media admin khác). Read công khai; ghi qua
--   service_role (route /api/admin/media dùng signed upload URL) nên KHÔNG cần insert policy cho client.
-- ⚠️ Guard: schema `storage` chỉ có khi Storage bật. Local tắt storage → NO-OP thay vì hỏng db reset.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'schema storage chưa có (Storage chưa bật) — bỏ qua thiết lập bucket media';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('media', 'media', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- Read: ai cũng xem được (bucket public — ảnh hiện trên trang pre-exam công khai).
  execute $p$drop policy if exists "media_public_read" on storage.objects$p$;
  execute $p$create policy "media_public_read" on storage.objects
            for select using (bucket_id = 'media')$p$;
end $$;
