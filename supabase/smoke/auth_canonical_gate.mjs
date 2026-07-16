// AUTH-007 gate — tripwire: middleware PHẢI nối canonical-host 308 + cứu mã OAuth đi lạc, và các chốt
//   auth cũ không được revert. Bug thật 2026-07-17: Site URL Supabase drift → code đáp vercel.app/'/'
//   → không session; app 2 origin → cookie tách đôi. Middleware là chỗ DUY NHẤT chặn được cả hai.
//     node supabase/smoke/auth_canonical_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
// line-comment TRƯỚC block-comment (bẫy '/*' trong line comment — xem writing_authoring_gate).
const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

const mw = stripComments(read('middleware.ts'))
const helper = read('lib/http/canonical-host.ts')
const gbtn = stripComments(read('components/auth/GoogleAuthButton.tsx'))
const cb = stripComments(read('app/auth/callback/route.ts'))
const registry = read('lib/env.ts')
const example = read('.env.example')
const mod = await import('../../lib/http/canonical-host.ts')

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('AUTH-007 — middleware nối đủ 2 tầng, ĐÚNG THỨ TỰ:')
check('middleware import từ lib/http/canonical-host', /from '@\/lib\/http\/canonical-host'/.test(mw))
check('gọi canonicalRedirectTarget', /canonicalRedirectTarget\(/.test(mw))
check('308 (permanent, giữ method) cho canonical hop', /NextResponse\.redirect\([^)]*,\s*308\)/.test(mw))
check('gọi strayAuthCodeRescue', /strayAuthCodeRescue\(/.test(mw))
// Thứ tự sống còn: canonical hop TRƯỚC rescue (PKCE verifier cookie nằm ở canonical host —
//   exchange trên host lạ là FAIL); cả hai TRƯỚC updateSession (redirect không cần refresh).
check('canonical hop ĐỨNG TRƯỚC rescue', mw.indexOf('canonicalRedirectTarget(') < mw.indexOf('strayAuthCodeRescue('))
check('cả hai ĐỨNG TRƯỚC updateSession', mw.indexOf('strayAuthCodeRescue(') < mw.indexOf('updateSession(request)'))
check('vẫn updateSession cho request thường (không mất refresh)', /return await updateSession\(request\)/.test(mw))

console.log('\nAUTH-007 — module thuần + hành vi lõi:')
check("canonical-host.ts KHÔNG import 'server-only'", !/import 'server-only'/.test(helper))
check('canonical-host.ts KHÔNG có import runtime', !/^\s*import\s/m.test(helper))
check('TÁI HIỆN BUG: vercel.app/?code → kéo về domain chính',
  mod.canonicalRedirectTarget({ host: 'x.vercel.app', pathname: '/', search: '?code=ea4a724c-8a01-4aa5-99b1-db4521aaaaaa', siteUrl: 'https://ieltspracticeplatform.online', vercelEnv: 'production' }) === 'https://ieltspracticeplatform.online/?code=ea4a724c-8a01-4aa5-99b1-db4521aaaaaa')
check('preview KHÔNG bị ép host',
  mod.canonicalRedirectTarget({ host: 'x.vercel.app', pathname: '/', search: '', siteUrl: 'https://ieltspracticeplatform.online', vercelEnv: 'preview' }) === null)
check('/api/* KHÔNG bị 308 (webhook/cron)',
  mod.canonicalRedirectTarget({ host: 'x.vercel.app', pathname: '/api/cron/reconcile-topups', search: '', siteUrl: 'https://ieltspracticeplatform.online', vercelEnv: 'production' }) === null)
check("mã đáp nhầm '/' được cứu về /auth/callback",
  mod.strayAuthCodeRescue('/', '?code=ea4a724c-8a01-4aa5-99b1-db4521aaaaaa') === '/auth/callback?code=ea4a724c-8a01-4aa5-99b1-db4521aaaaaa')

console.log('\nAUTH-007 — chốt cũ không revert (đã đúng từ trước, giữ nguyên):')
check('GoogleAuthButton vẫn redirectTo origin/auth/callback (không để Supabase tự quyết)',
  /window\.location\.origin\}\/auth\/callback\?next=/.test(gbtn))
check('callback vẫn safeNextPath (chống open-redirect)', /safeNextPath\(searchParams\.get\('next'\)\)/.test(cb))
check('callback vẫn exchangeCodeForSession', /exchangeCodeForSession\(code\)/.test(cb))

console.log('\nAUTH-007 — hợp đồng ENV (DEPLOY-004):')
check('VERCEL_ENV khai trong ENV_REGISTRY', /VERCEL_ENV/.test(registry))
check('VERCEL_ENV có trong .env.example', /(^|\n)\s*#?\s*VERCEL_ENV=/.test(example))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
