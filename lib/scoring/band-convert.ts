// ============================================================
// W6 — Band conversion (M05). raw_score → band qua score_bands theo test type.
// `bandFromRows` PURE (unit-testable). `convertToBand` đọc score_bands (server).
// Thiếu seed / không map → band=null + warning (KHÔNG ghi band sai âm thầm).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export type ScoreBandRow = { raw_min: number; raw_max: number; band: number }

// PURE: row đầu tiên có raw_min ≤ raw ≤ raw_max → band; không có → null.
export function bandFromRows(rawScore: number, rows: ScoreBandRow[]): number | null {
  for (const r of rows) {
    if (rawScore >= r.raw_min && rawScore <= r.raw_max) return r.band
  }
  return null
}

export type BandWarning = 'SCORE_BANDS_MISSING' | 'BAND_UNMAPPED'
export type BandResult = { band: number | null; warning: BandWarning | null }

type RawBandRow = { raw_min: number | string | null; raw_max: number | string | null; band: number | string | null }

export async function convertToBand(
  admin: SupabaseClient,
  rawScore: number,
  testType: string,
): Promise<BandResult> {
  const { data, error } = await admin
    .from('score_bands')
    .select('raw_min, raw_max, band')
    .eq('test_type', testType)
  if (error) throw new Error(error.message)

  // numeric/smallint của Postgres có thể về dạng string qua supabase-js → ép Number.
  const rows: ScoreBandRow[] = (data ?? [])
    .map((r) => r as RawBandRow)
    .filter((r) => r.raw_min != null && r.raw_max != null && r.band != null)
    .map((r) => ({ raw_min: Number(r.raw_min), raw_max: Number(r.raw_max), band: Number(r.band) }))

  if (rows.length === 0) return { band: null, warning: 'SCORE_BANDS_MISSING' }
  const band = bandFromRows(rawScore, rows)
  if (band == null) return { band: null, warning: 'BAND_UNMAPPED' }
  return { band, warning: null }
}
