-- ============================================================
-- W1+2 Backend — product_search MATERIALIZED VIEW
-- Source: plan v1.6 §8, docs/Architecture/security_rls_contract.md
-- ⚠️ Matview KHÔNG hỗ trợ RLS và BỎ QUA RLS bảng gốc → CHỈ chứa public metadata.
--    Kiểm soát bằng GRANT SELECT (anon/authenticated); REFRESH chỉ server/service-role.
--    Lọc status='published' để không lộ product draft/hidden.
-- ============================================================

create materialized view public.product_search as
select
  p.id          as product_id,
  p.slug,
  p.title,
  p.description,
  p.thumbnail,
  p.price_coins,
  p.status,
  p.sort_order,
  p.created_at,
  coalesce(array_agg(distinct t.type::text) filter (where t.type is not null), '{}'::text[]) as skills,
  -- question_types qua subquery (KHÔNG dùng lateral unnest ở join chính → tránh nhân đôi
  --   sum(attempts_count)/count(test_id) khi 1 test có nhiều question_types)
  coalesce((
    select array_agg(distinct qt)
    from public.collection_tests ct2
    join public.tests t2 on t2.id = ct2.test_id and t2.status = 'published'
    cross join lateral unnest(coalesce(t2.question_types, '{}'::text[])) as qt
    where ct2.product_id = p.id
  ), '{}'::text[]) as question_types,
  coalesce(array_agg(distinct t.difficulty) filter (where t.difficulty is not null), '{}'::smallint[]) as difficulties,
  count(distinct t.id)::int as test_count,
  coalesce(bool_or(t.is_free), false) as has_free_test,  -- product CÓ ít nhất 1 đề free (cho filter "Có đề free"); KHÁC "product free" (price_coins=0)
  coalesce(sum(t.attempts_count), 0)::int as attempts_total
from public.products p
left join public.collection_tests ct on ct.product_id = p.id
left join public.tests t            on t.id = ct.test_id and t.status = 'published'  -- chỉ gộp test published
where p.status = 'published'
group by p.id, p.slug, p.title, p.description, p.thumbnail, p.price_coins, p.status, p.sort_order, p.created_at;

-- Unique index bắt buộc cho REFRESH ... CONCURRENTLY
create unique index idx_product_search_pid on public.product_search (product_id);

grant select on public.product_search to anon, authenticated;

-- Refresh chỉ server/service-role gọi (vd sau khi admin publish/sửa product, hoặc cron)
create or replace function public.refresh_product_search()
returns void language sql security definer set search_path = public as $$
  refresh materialized view concurrently public.product_search;
$$;
revoke all on function public.refresh_product_search() from public;  -- chặn cả PUBLIC (PG mặc định grant EXECUTE cho PUBLIC)
grant execute on function public.refresh_product_search() to service_role;  -- chỉ server (service_role) được refresh
