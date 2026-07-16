// AUTH-007 smoke — canonical host + cứu mã OAuth đi lạc (lib/http/canonical-host.ts, module PRODUCTION).
//   Bug thật 2026-07-17: login trên domain chính → Supabase fallback về vercel.app/?code=<uuid> →
//   code không được đổi session (đáp sai chỗ) + cookie tách đôi giữa 2 origin.
//     node supabase/smoke/canonical_host_smoke.mjs
import { canonicalRedirectTarget, strayAuthCodeRescue } from '../../lib/http/canonical-host.ts'

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

const SITE = 'https://ieltspracticeplatform.online'
const base = { siteUrl: SITE, vercelEnv: 'production' }

console.log('AUTH-007 — canonicalRedirectTarget (production ép về 1 origin):')
{
  // TÁI HIỆN ĐÚNG BUG: vercel.app/?code=... phải bị kéo về domain chính, giữ nguyên query.
  const t = canonicalRedirectTarget({ ...base, host: 'ielts-practice-platform-8rzx-eta.vercel.app', pathname: '/', search: '?code=ea4a724c-8a01-4aa5-99b1-db4521aaaaaa' })
  check('host vercel.app → 308 về domain chính, GIỮ path+query',
    t === `${SITE}/?code=ea4a724c-8a01-4aa5-99b1-db4521aaaaaa`, String(t))
  check('đường bất kỳ cũng bị kéo về (login?next=/admin — bug 3)',
    canonicalRedirectTarget({ ...base, host: 'x.vercel.app', pathname: '/login', search: '?next=%2Fadmin' }) === `${SITE}/login?next=%2Fadmin`)
  check('đã đúng host → null (không loop)',
    canonicalRedirectTarget({ ...base, host: 'ieltspracticeplatform.online', pathname: '/', search: '' }) === null)
  check('host đúng nhưng KHÁC HOA/thường → null (so case-insensitive)',
    canonicalRedirectTarget({ ...base, host: 'IELTSPracticePlatform.online', pathname: '/', search: '' }) === null)
}

console.log('\nAUTH-007 — các trường hợp KHÔNG được đụng:')
{
  check('preview (VERCEL_ENV=preview) → null (không phá preview deployment)',
    canonicalRedirectTarget({ ...base, vercelEnv: 'preview', host: 'x-git-branch.vercel.app', pathname: '/', search: '' }) === null)
  check('dev local (VERCEL_ENV undefined) → null',
    canonicalRedirectTarget({ ...base, vercelEnv: undefined, host: 'localhost:3000', pathname: '/', search: '' }) === null)
  check('/api/* → null (webhook SePay/Vercel Cron không chắc follow 308 — redirect là MẤT webhook)',
    canonicalRedirectTarget({ ...base, host: 'x.vercel.app', pathname: '/api/payment/webhook/sepay', search: '' }) === null)
  check('/api (đúng gốc) → null', canonicalRedirectTarget({ ...base, host: 'x.vercel.app', pathname: '/api', search: '' }) === null)
  check('/apixyz (không phải /api/) → VẪN redirect (prefix phải đúng segment)',
    canonicalRedirectTarget({ ...base, host: 'x.vercel.app', pathname: '/apixyz', search: '' }) === `${SITE}/apixyz`)
  check('NEXT_PUBLIC_SITE_URL trống → null (fail-open, không chết site vì env thiếu)',
    canonicalRedirectTarget({ ...base, siteUrl: undefined, host: 'x.vercel.app', pathname: '/', search: '' }) === null)
  check('siteUrl http:// (không https) → null',
    canonicalRedirectTarget({ ...base, siteUrl: 'http://ieltspracticeplatform.online', host: 'x.vercel.app', pathname: '/', search: '' }) === null)
  check('siteUrl rác "not a url" → null (không throw)',
    canonicalRedirectTarget({ ...base, siteUrl: 'https://', host: 'x.vercel.app', pathname: '/', search: '' }) === null)
  check('host null → null (không throw)',
    canonicalRedirectTarget({ ...base, host: null, pathname: '/', search: '' }) === null)
  check('siteUrl có path thừa → vẫn dùng ORIGIN (không nhân đôi path)',
    canonicalRedirectTarget({ ...base, siteUrl: `${SITE}/`, host: 'x.vercel.app', pathname: '/pricing', search: '' }) === `${SITE}/pricing`)
}

console.log('\nAUTH-007 — strayAuthCodeRescue (mã đáp nhầm "/" phải được cứu):')
{
  const q = '?code=ea4a724c-8a01-4aa5-99b1-db4521aaaaaa'
  check("'/' + code UUID → /auth/callback giữ nguyên query", strayAuthCodeRescue('/', q) === `/auth/callback${q}`)
  check('giữ nguyên MỌI query kèm theo (vd next)',
    strayAuthCodeRescue('/', `${q}&next=%2Fadmin`) === `/auth/callback${q}&next=%2Fadmin`)
  check("'/' không query → null", strayAuthCodeRescue('/', '') === null)
  check("'/' query khác (không code) → null", strayAuthCodeRescue('/', '?utm_source=x') === null)
  check('code KHÔNG phải UUID → null (không đụng ?code= của tính năng khác)',
    strayAuthCodeRescue('/', '?code=TOPUP-abc123') === null)
  check('path khác "/" → null (chỉ cứu nơi Site-URL fallback đáp)',
    strayAuthCodeRescue('/pricing', q) === null)
  check('/auth/callback → null (không tự redirect chính nó)',
    strayAuthCodeRescue('/auth/callback', q) === null)
  check('UUID hoa/thường đều nhận', strayAuthCodeRescue('/', '?code=EA4A724C-8A01-4AA5-99B1-DB4521AAAAAA') === '/auth/callback?code=EA4A724C-8A01-4AA5-99B1-DB4521AAAAAA')
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
