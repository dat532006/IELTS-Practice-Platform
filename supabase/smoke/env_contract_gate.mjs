// DEPLOY-004 gate — hợp đồng ENV không drift + scope an toàn + checkEnv theo mode.
//   (a) MỌI process.env.X đọc trong lib/app phải khai trong ENV_REGISTRY (lib/env.ts) + có ở .env.example.
//   (b) KHÔNG secret nào mang tên NEXT_PUBLIC_.
//   (c) checkEnv báo đúng missing theo mode (core/prod/payment-live/ai) — CHỈ trả tên, không giá trị.
//     node supabase/smoke/env_contract_gate.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { ENV_REGISTRY, checkEnv, assertServerSecretsPrivate } = await import('../../lib/env.ts')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

// Thu mọi process.env.X đọc trong lib/ + app/
function walk(dir) {
  const out = []
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx|mjs)$/.test(f)) out.push(p)
  }
  return out
}
const IGNORE = new Set(['NODE_ENV']) // runtime chuẩn, không thuộc hợp đồng app
const readVars = new Set()
for (const dir of ['lib', 'app']) {
  for (const file of walk(resolve(root, dir))) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) if (!IGNORE.has(m[1])) readVars.add(m[1])
  }
}
const registryNames = new Set(ENV_REGISTRY.map((v) => v.name))
const envExample = readFileSync(resolve(root, '.env.example'), 'utf8')
const inExample = (name) => new RegExp(`(^|\\n)\\s*#?\\s*${name}=`).test(envExample)

console.log('DEPLOY-004 — không drift (code ↔ registry ↔ .env.example):')
const undocRegistry = [...readVars].filter((v) => !registryNames.has(v))
check('mọi biến code đọc đều có trong ENV_REGISTRY', undocRegistry.length === 0, `thiếu registry: ${undocRegistry.join(', ')}`)
const undocExample = [...readVars].filter((v) => !inExample(v))
check('mọi biến code đọc đều có trong .env.example', undocExample.length === 0, `thiếu .env.example: ${undocExample.join(', ')}`)
const registryNotExample = ENV_REGISTRY.map((v) => v.name).filter((n) => !inExample(n))
check('mọi biến registry đều có trong .env.example', registryNotExample.length === 0, `thiếu: ${registryNotExample.join(', ')}`)

console.log('\nDEPLOY-004 — scope an toàn (secret không NEXT_PUBLIC):')
check('không secret nào mang tên NEXT_PUBLIC_', assertServerSecretsPrivate().length === 0, assertServerSecretsPrivate().join(', '))
check('mọi NEXT_PUBLIC_ đều scope public', ENV_REGISTRY.filter((v) => v.name.startsWith('NEXT_PUBLIC_')).every((v) => v.scope === 'public'))

console.log('\nDEPLOY-004 — checkEnv theo mode (chỉ tên, không giá trị):')
{
  const r = checkEnv({}) // rỗng → thiếu core
  check('env rỗng → thiếu 3 core Supabase', r.missing.includes('NEXT_PUBLIC_SUPABASE_URL') && r.missing.includes('SUPABASE_SERVICE_ROLE_KEY') && !r.ok)
  check('checkEnv chỉ trả TÊN biến (không giá trị)', r.missing.every((n) => typeof n === 'string' && /^[A-Z_]/.test(n)))
}
{
  const base = { NEXT_PUBLIC_SUPABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x', WRITING_GRADER_MOCK: '1' }
  check('core đủ + mock → ok (không cần AI key)', checkEnv(base).ok === true)
  check('prod thiếu CRON_SECRET → missing', checkEnv({ ...base, NODE_ENV: 'production' }).missing.includes('CRON_SECRET'))
  check('payment live thiếu webhook secret → missing', checkEnv({ ...base, PAYMENT_GATEWAY_MODE: 'live' }).missing.includes('PAYMENT_WEBHOOK_SECRET'))
  check('AI không mock + không key → thiếu ANTHROPIC_API_KEY', checkEnv({ NEXT_PUBLIC_SUPABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x' }).missing.includes('ANTHROPIC_API_KEY'))
  check('AI provider=openai + có OPENAI key → không đòi ANTHROPIC', !checkEnv({ NEXT_PUBLIC_SUPABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x', WRITING_AI_PROVIDER: 'openai', OPENAI_API_KEY: 'y' }).missing.includes('ANTHROPIC_API_KEY'))
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
