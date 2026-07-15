-- ============================================================
-- TEST-005 — Kiểm THẬT policy Storage (không còn "skip nhưng báo passed").
-- Chạy SAU migrations trong verify-db (shim đã cấp storage schema tối giản → nhánh storage của 2 migration
--   bucket đã chạy → bucket + policy phải tồn tại). Thiếu bất kỳ cái nào → RAISE EXCEPTION (gate FAIL).
-- Bao phủ: bucket public avatars/media + 5 policy trên storage.objects (owner-scoped + public read).
-- ============================================================
do $$
declare
  missing text := '';
  b_avatars boolean;
  b_media   boolean;
  n_policies int;
  expected text[] := array['avatars_public_read','avatars_owner_insert','avatars_owner_update','avatars_owner_delete','media_public_read'];
  p text;
begin
  -- 1) Bucket avatars/media tồn tại + PUBLIC
  select exists(select 1 from storage.buckets where id='avatars' and public) into b_avatars;
  select exists(select 1 from storage.buckets where id='media'   and public) into b_media;
  if not b_avatars then missing := missing || ' bucket:avatars(public)'; end if;
  if not b_media   then missing := missing || ' bucket:media(public)'; end if;

  -- 2) Đủ 5 policy trên storage.objects, đúng tên
  foreach p in array expected loop
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname=p) then
      missing := missing || ' policy:' || p;
    end if;
  end loop;

  -- 3) RLS bật trên storage.objects (policy vô nghĩa nếu RLS tắt)
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='storage' and c.relname='objects' and c.relrowsecurity) then
    missing := missing || ' rls:storage.objects(disabled)';
  end if;

  select count(*) into n_policies from pg_policies where schemaname='storage' and tablename='objects';

  if missing <> '' then
    raise exception 'TEST-005 Storage policy check FAILED — thiếu:%', missing;
  end if;
  raise notice 'TEST-005 Storage OK — 2 bucket public + % policy trên storage.objects, RLS bật', n_policies;
end $$;
