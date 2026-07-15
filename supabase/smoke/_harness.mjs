// ============================================================
// TEST-003 — Exit contract DÙNG CHUNG cho smoke. Trước đây smoke thiếu prereq (Supabase env, pepper) vẫn
//   exit 0 → CI báo PASS GIẢ. Hợp đồng mã thoát:
//     0 = mọi assertion chạy & PASS
//     1 = có assertion FAIL
//     2 = ERROR/BLOCKED (crash, thiếu cấu hình bắt buộc)
//     3 = SKIPPED vì thiếu prereq mà smoke này REQUIRED (thiếu Supabase env…) — required-skip FAIL-CLOSED
//   Optional smoke (required=false) được phép SKIP → exit 0 (không làm ồn dev). In dòng máy đọc SMOKE_RESULT.
//   PURE (không import ngoài) → Node type-strip/test trực tiếp.
// ============================================================

export function smokeExit({ passed = 0, failed = 0, skipped = 0, blocked = 0, required = true }) {
  if (failed > 0) return 1
  if (blocked > 0) return 2
  if (skipped > 0) return required ? 3 : 0
  return 0
}

export function statusOf({ passed = 0, failed = 0, skipped = 0, blocked = 0 }) {
  if (failed > 0) return 'FAILED'
  if (blocked > 0) return 'BLOCKED'
  if (skipped > 0) return 'SKIPPED'
  return 'PASSED'
}

// In tổng kết + dòng máy đọc `SMOKE_RESULT {json}` rồi set process.exitCode theo hợp đồng.
export function finishSmoke({ name, passed = 0, failed = 0, skipped = 0, blocked = 0, required = true }) {
  const status = statusOf({ passed, failed, skipped, blocked })
  const exit = smokeExit({ passed, failed, skipped, blocked, required })
  const parts = [`${passed} passed`, `${failed} failed`]
  if (skipped) parts.push(`${skipped} skipped`)
  if (blocked) parts.push(`${blocked} blocked`)
  console.log(`\nRESULT: ${parts.join(', ')}`)
  console.log(`SMOKE_RESULT ${JSON.stringify({ name, status, passed, failed, skipped, blocked, required, exit })}`)
  process.exitCode = exit
  return exit
}

// Runner tổng hợp: mọi smoke REQUIRED phải PASSED, nếu không → gate fail (exit 1).
export function aggregateSmokes(results) {
  const totals = { total: results.length, passed: 0, failed: 0, skipped: 0, blocked: 0, requiredNotPassed: 0 }
  for (const r of results) {
    if (r.status === 'PASSED') totals.passed++
    else if (r.status === 'FAILED') totals.failed++
    else if (r.status === 'SKIPPED') totals.skipped++
    else if (r.status === 'BLOCKED') totals.blocked++
    if (r.required && r.status !== 'PASSED') totals.requiredNotPassed++
  }
  return { exit: totals.requiredNotPassed > 0 ? 1 : 0, totals }
}
