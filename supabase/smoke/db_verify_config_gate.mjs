// TEST-004/TEST-005 source gate — chốt cấu hình verifier (chống revert). Hành vi đã verify THẬT qua
// db:verify trên postgres:17-alpine (RLS 1-38 + Storage OK) và chứng minh non-vacuous (bỏ migration →
// storage check FAIL liệt kê đủ bucket/policy thiếu).
//   node supabase/smoke/db_verify_config_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('TEST-004 — verifier khớp Postgres production (PG17):')
const ps = read('scripts/verify-db.ps1')
check('image mặc định postgres:17-alpine (không còn 16)', /else \{ 'postgres:17-alpine' \}/.test(ps) && !/\$img\s*=\s*'postgres:16-alpine'/.test(ps))
check('parameterize qua $env:PG_IMAGE (matrix CI)', /if \(\$env:PG_IMAGE\)/.test(ps))

console.log('\nTEST-005 — gate kiểm THẬT Storage (không skip-nhưng-passed):')
check('verifier apply storage_policy_check.sql sau migrations', /storage_policy_check\.sql/.test(ps))
const shim = read('supabase/tests/_supabase_shim.local.sql')
check('shim cấp schema storage + buckets/objects + foldername', /create schema if not exists storage/.test(shim) && /create table if not exists storage\.buckets/.test(shim) && /create table if not exists storage\.objects/.test(shim) && /storage\.foldername/.test(shim))
check('shim bật RLS trên storage.objects', /alter table storage\.objects enable row level security/.test(shim))
const chk = read('supabase/tests/storage_policy_check.sql')
check('check assert 5 policy + 2 bucket public, raise exception khi thiếu', /avatars_public_read/.test(chk) && /media_public_read/.test(chk) && /raise exception 'TEST-005 Storage policy check FAILED/.test(chk))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
