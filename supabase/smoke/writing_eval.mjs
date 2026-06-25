// W11 Writing AI evaluation harness.
// Uses Owner-provided docs/Evaluation/writing_eval_samples.json when available.
// Does NOT fabricate expert bands. Missing fixture exits 0 with BLOCKED so CI/static gates can pass while report records blocker.
// Optional live/mock execution requires local Next + Supabase like writing_grading_smoke.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SAMPLE_PATH = process.env.WRITING_EVAL_SAMPLES || resolve(ROOT, 'docs', 'Evaluation', 'writing_eval_samples.json')
const TOLERANCE = 0.5

function isBand(v) {
  return typeof v === 'number' && v >= 0 && v <= 9 && Number.isInteger(v * 2)
}
function loadSamples() {
  if (!existsSync(SAMPLE_PATH)) return { ok: false, reason: `missing ${SAMPLE_PATH}` }
  const parsed = JSON.parse(readFileSync(SAMPLE_PATH, 'utf8'))
  const samples = Array.isArray(parsed) ? parsed : parsed.samples
  if (!Array.isArray(samples) || samples.length === 0) return { ok: false, reason: 'sample file has no samples[]' }
  for (const [idx, s] of samples.entries()) {
    if (!s.id || typeof s.task1_prompt !== 'string' || typeof s.task2_prompt !== 'string' || typeof s.task1_text !== 'string' || typeof s.task2_text !== 'string') {
      return { ok: false, reason: `sample ${idx} missing prompt/text fields` }
    }
    if (!isBand(s.expert?.task1_band) || !isBand(s.expert?.task2_band) || !isBand(s.expert?.overall_band)) {
      return { ok: false, reason: `sample ${s.id ?? idx} missing valid expert task1/task2/overall bands` }
    }
  }
  return { ok: true, samples }
}
function agreement(rows, key) {
  const ok = rows.filter((r) => Math.abs(r.ai[key] - r.expert[key]) <= TOLERANCE).length
  return { ok, total: rows.length, pct: Math.round((ok / rows.length) * 1000) / 10 }
}

async function run() {
  const loaded = loadSamples()
  if (!loaded.ok) {
    console.log('WRITING_EVAL: BLOCKED — Owner sample essays + expert bands are required.')
    console.log(`Reason: ${loaded.reason}`)
    console.log('Expected fixture: docs/Evaluation/writing_eval_samples.json')
    console.log('Shape: {"samples":[{"id":"s1","task1_prompt":"...","task2_prompt":"...","task1_text":"...","task2_text":"...","expert":{"task1_band":5.5,"task2_band":6.0,"overall_band":6.0}}]}')
    return
  }

  const mod = await import('../../lib/ai/writing-grader.ts')
  const { computeOverallBand } = await import('../../lib/scoring/writing-band.ts')
  const rows = []
  for (const sample of loaded.samples) {
    const result = await mod.gradeWriting(sample)
    if (!result.ok) throw new Error(`grader failed for sample ${sample.id}: ${result.code}`)
    const ai = {
      task1_band: result.grade.task1.band,
      task2_band: result.grade.task2.band,
      overall_band: computeOverallBand(result.grade.task1.band, result.grade.task2.band),
    }
    rows.push({ id: sample.id, ai, expert: sample.expert, mock: result.mock })
  }

  const task1 = agreement(rows, 'task1_band')
  const task2 = agreement(rows, 'task2_band')
  const overall = agreement(rows, 'overall_band')
  console.log('WRITING_EVAL: COMPLETED')
  console.log(`samples=${rows.length}`)
  console.log(`task1 within ±${TOLERANCE}: ${task1.ok}/${task1.total} (${task1.pct}%)`)
  console.log(`task2 within ±${TOLERANCE}: ${task2.ok}/${task2.total} (${task2.pct}%)`)
  console.log(`overall within ±${TOLERANCE}: ${overall.ok}/${overall.total} (${overall.pct}%)`)
  console.log(JSON.stringify(rows, null, 2))
}

run().catch((e) => { console.error('WRITING_EVAL: FAIL', e?.message ?? e); process.exitCode = 1 })
