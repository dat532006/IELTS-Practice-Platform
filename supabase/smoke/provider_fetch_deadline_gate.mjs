// Provider fetch deadline/cap gate (PAY-006) — outbound provider fetch phải: (a) quá hạn → abort trong
// budget (không treo theo default nền tảng); (b) body vượt cap → từ chối (content-length hoặc stream).
// Dựng http server cục bộ mô phỏng delayed/oversized/small; import helper production (Node type-stripping,
// helper không 'server-only', không local import).   node supabase/smoke/provider_fetch_deadline_gate.mjs
import { createServer } from 'node:http'
import { fetchWithDeadline, readCappedArrayBuffer } from '../../lib/net/fetch-deadline.ts'

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

const CAP = 10 * 1024 // 10KB cho test

const timers = []
const server = createServer((req, res) => {
  if (req.url === '/delay') {
    // không phản hồi trong 3s → deadline phải abort trước đó. unref + track để cleanup không treo/loop.
    const t = setTimeout(() => { try { res.end('late') } catch {} }, 3000)
    t.unref?.()
    timers.push(t)
    return
  }
  if (req.url === '/small') {
    const buf = Buffer.alloc(1024, 1) // 1KB
    res.setHeader('content-type', 'image/png')
    res.setHeader('content-length', String(buf.length))
    res.end(buf)
    return
  }
  if (req.url === '/big-cl') {
    const buf = Buffer.alloc(100 * 1024, 1) // 100KB, content-length chính xác > cap
    res.setHeader('content-type', 'image/png')
    res.setHeader('content-length', String(buf.length))
    res.end(buf)
    return
  }
  if (req.url === '/big-nocl') {
    // chunked, KHÔNG content-length, ~100KB → stream cap phải chặn
    res.setHeader('content-type', 'image/png')
    for (let i = 0; i < 100; i++) res.write(Buffer.alloc(1024, 1))
    res.end()
    return
  }
  res.statusCode = 404; res.end('nope')
})

const run = async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const base = `http://127.0.0.1:${port}`
  try {
    // 1) DELAY → deadline abort trong budget (không chờ 3s của server)
    {
      const t0 = Date.now()
      let threw = false, name = ''
      try { await fetchWithDeadline(`${base}/delay`, {}, 400) } catch (e) { threw = true; name = e?.name ?? '' }
      const dt = Date.now() - t0
      check('delayed upstream → abort (throw)', threw, `name=${name}`)
      check(`abort trong budget (~400ms, thực ${dt}ms < 2000)`, dt < 2000, `dt=${dt}`)
      check('lỗi là TimeoutError (deadline, không phải khác)', name === 'TimeoutError', `name=${name}`)
    }
    // 2) SMALL → đọc được, dưới cap
    {
      const res = await fetchWithDeadline(`${base}/small`, {}, 2000)
      const buf = await readCappedArrayBuffer(res, CAP)
      check('small body → đọc được (không null)', buf != null && buf.byteLength === 1024, `len=${buf?.byteLength}`)
    }
    // 3) BIG + content-length chính xác > cap → từ chối sớm
    {
      const res = await fetchWithDeadline(`${base}/big-cl`, {}, 2000)
      const buf = await readCappedArrayBuffer(res, CAP)
      check('oversized (content-length > cap) → null (từ chối)', buf === null, `len=${buf?.byteLength}`)
    }
    // 4) BIG không content-length (chunked) → stream cap chặn
    {
      const res = await fetchWithDeadline(`${base}/big-nocl`, {}, 2000)
      const buf = await readCappedArrayBuffer(res, CAP)
      check('oversized (chunked, no content-length) → null (stream cap)', buf === null, `len=${buf?.byteLength}`)
    }
  } finally {
    for (const t of timers) clearTimeout(t)
    server.closeAllConnections?.()
    server.close()
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  // exitCode + để loop tự thoát (tránh assertion libuv khi process.exit cắt ngang socket đang đóng trên Windows)
  process.exitCode = fail ? 1 : 0
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); for (const t of timers) clearTimeout(t); server.closeAllConnections?.(); server.close(); process.exitCode = 1 })
