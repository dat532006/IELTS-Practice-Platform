# Supabase — Migrations & RLS (W1+2 Backend)

## Cấu trúc

```
supabase/
├── migrations/
│   ├── 20260601000100_extensions_enums.sql      ENUM + extensions
│   ├── 20260601000200_core_tables.sql           19 bảng domain (đúng FK order)
│   ├── 20260601000300_indexes.sql               indexes (GIN question_types, ...)
│   ├── 20260601000400_rls_grants_policies.sql   RLS enable + GRANT + policies
│   ├── 20260601000500_profiles_sensitive_guard.sql  column-grant + trigger (role/coins/plan)
│   ├── 20260601000600_auth_profile_bootstrap.sql    handle_new_user trigger
│   └── 20260601000700_product_search.sql        materialized view + refresh fn
└── tests/
    ├── _supabase_shim.local.sql   ⚠️ CHỈ để test local (Docker) — giả lập auth/roles
    └── rls_smoke.sql              RLS smoke test (deny answer_keys, isolation, role guard, trigger)
```

## Áp dụng lên Supabase

```bash
# với Supabase CLI (khuyến nghị):
supabase db reset          # local stack: chạy lại toàn bộ migrations
supabase db push           # đẩy migrations lên project remote
```
> KHÔNG áp dụng `tests/_supabase_shim.local.sql` lên Supabase — Supabase đã có `auth` schema, roles và `auth.uid()`.

## Verify local bằng Docker (không cần Supabase CLI)

```powershell
npm run db:verify
# = powershell -ExecutionPolicy Bypass -File scripts/verify-db.ps1
```
Script sẽ: tạo Postgres tạm → apply shim → apply migrations theo thứ tự → chạy `rls_smoke.sql` → in `ALL PASSED` rồi xoá container.

## Trạng thái verify

- ✅ **PASS 2026-06-02** — `npm run db:verify` (Docker `postgres:16-alpine` + shim): migrations apply sạch từ DB rỗng, **RLS smoke 10/10**.
- Verify trên Postgres vanilla + Supabase shim. Apply lên Supabase project thật (`supabase db push`) khi có env.

## Ghi chú thiết kế bảo mật

- `answer_keys`, `activation_codes`: RLS bật, **không grant** cho client → deny toàn bộ; chỉ `service_role` (bypass RLS) đọc.
- `tests`: GRANT **theo cột** (loại trừ `passages`/`questions`) → client xem metadata, exam payload chỉ trả qua server sau access check (`is_free` | `test_unlocks`).
- `profiles`: `role/coins/plan` khoá 2 tầng (column-grant + trigger `lock_sensitive_cols`).
- `product_search`: matview (không RLS) → chỉ chứa product `published` + GRANT SELECT; `REFRESH` chỉ server/service-role.
