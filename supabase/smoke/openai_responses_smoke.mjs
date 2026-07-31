// AI-003 smoke — hợp đồng OpenAI Responses API cho grader Writing (lib/ai/openai-responses.ts).
//   Vì sao có file này: gpt-5.6-* là REASONING model — reasoning token TÍNH VÀO max_output_tokens.
//   Budget 4000 (dùng chung với Anthropic max_tokens) → reasoning nuốt hết → status:'incomplete' →
//   KHÔNG có output_text → chấm Writing luôn hỏng. OpenAI khuyến nghị chừa TỐI THIỂU 25.000.
//   Import module production trực tiếp (Node type-stripping: module KHÔNG 'server-only', không import).
//     node supabase/smoke/openai_responses_smoke.mjs
import {
  openaiMaxOutputTokens,
  openaiReasoningEffort,
  parseOpenAiResponse,
  OPENAI_MIN_RESERVED_REASONING_TOKENS,
} from '../../lib/ai/openai-responses.ts'

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('AI-003 — max_output_tokens (reasoning budget):')
{
  const d = openaiMaxOutputTokens({})
  check('không set → mặc định', typeof d === 'number' && d > 0, `d=${d}`)
  // BẤT BIẾN CỐT LÕI: mặc định phải chừa đủ chỗ cho reasoning theo khuyến nghị OpenAI (≥25k).
  check(`mặc định ≥ ${OPENAI_MIN_RESERVED_REASONING_TOKENS} (khuyến nghị OpenAI)`, d >= OPENAI_MIN_RESERVED_REASONING_TOKENS, `d=${d}`)
  check('giá trị hợp lệ → dùng đúng', openaiMaxOutputTokens({ WRITING_GRADER_OPENAI_MAX_OUTPUT_TOKENS: '48000' }) === 48000)
  // REGRESSION TRỰC TIẾP CỦA BUG: 4000 quá nhỏ → KHÔNG được dùng (reasoning sẽ nuốt hết).
  check('4000 (quá nhỏ) → KHÔNG dùng, rơi về mặc định', openaiMaxOutputTokens({ WRITING_GRADER_OPENAI_MAX_OUTPUT_TOKENS: '4000' }) === d, `got=${openaiMaxOutputTokens({ WRITING_GRADER_OPENAI_MAX_OUTPUT_TOKENS: '4000' })}`)
  check('không phải số → mặc định', openaiMaxOutputTokens({ WRITING_GRADER_OPENAI_MAX_OUTPUT_TOKENS: 'abc' }) === d)
  check('rỗng → mặc định', openaiMaxOutputTokens({ WRITING_GRADER_OPENAI_MAX_OUTPUT_TOKENS: '   ' }) === d)
  check('âm → mặc định', openaiMaxOutputTokens({ WRITING_GRADER_OPENAI_MAX_OUTPUT_TOKENS: '-5' }) === d)
  const big = openaiMaxOutputTokens({ WRITING_GRADER_OPENAI_MAX_OUTPUT_TOKENS: '9999999' })
  check('vượt trần model → clamp (không gửi giá trị model từ chối)', big === 128000, `big=${big}`)
}

console.log('\nAI-003 — reasoning.effort (nút vặn chi phí, fail-loud như AI-002):')
{
  // Owner chốt 2026-07-31: mặc định của DỰ ÁN là 'high' (khác mặc định 'medium' của OpenAI) — chốt ở
  //   đây để không ai hạ effort bằng cách sửa code mà không thấy; muốn đổi thì đặt env, không sửa hằng.
  const d = openaiReasoningEffort({})
  check("không set → ok + mặc định 'high' (mặc định của DỰ ÁN, không phải của OpenAI)", d.ok === true && d.effort === 'high', JSON.stringify(d))
  check("'low' → ok/low", openaiReasoningEffort({ WRITING_GRADER_OPENAI_REASONING_EFFORT: 'low' }).effort === 'low')
  check("' HIGH ' → trim+lowercase → high", openaiReasoningEffort({ WRITING_GRADER_OPENAI_REASONING_EFFORT: ' HIGH ' }).effort === 'high')
  for (const e of ['none', 'low', 'medium', 'high', 'xhigh', 'max']) {
    const r = openaiReasoningEffort({ WRITING_GRADER_OPENAI_REASONING_EFFORT: e })
    check(`'${e}' hợp lệ theo docs GPT-5.6`, r.ok === true && r.effort === e, JSON.stringify(r))
  }
  // AI-002 precedent: config lạ KHÔNG được âm thầm đổi → chi phí/hành vi ngoài dự kiến.
  const bad = openaiReasoningEffort({ WRITING_GRADER_OPENAI_REASONING_EFFORT: 'hihg' })
  check('typo → fail-loud invalid_config (KHÔNG âm thầm về mặc định)', bad.ok === false && bad.reason === 'invalid_config', JSON.stringify(bad))
  check("'ultra' (không tồn tại) → fail-loud", openaiReasoningEffort({ WRITING_GRADER_OPENAI_REASONING_EFFORT: 'ultra' }).ok === false)
  check('rỗng → coi như không set → về mặc định dự án', openaiReasoningEffort({ WRITING_GRADER_OPENAI_REASONING_EFFORT: '  ' }).effort === 'high')
}

console.log('\nAI-003 — parseOpenAiResponse (quan sát được vì sao hỏng):')
{
  const okBody = {
    output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', content: [{ type: 'output_text', text: '{"task1":1}' }] },
    ],
    usage: { input_tokens: 11, output_tokens: 22 },
  }
  const r = parseOpenAiResponse(okBody)
  check('message hợp lệ → ok + JSON parsed', r.ok === true && JSON.stringify(r.json) === '{"task1":1}', JSON.stringify(r))
  check('usage lấy đúng', r.ok === true && r.usage.input_tokens === 11 && r.usage.output_tokens === 22)
  check('bỏ qua item reasoning đứng trước message', r.ok === true)

  // BẤT BIẾN CỐT LÕI: truncation PHẢI phân biệt được, không lẫn vào lỗi chung.
  const inc = parseOpenAiResponse({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'reasoning' }] })
  check('incomplete/max_output_tokens → fail + reason nêu đúng nguyên nhân',
    inc.ok === false && inc.reason === 'incomplete_max_output_tokens', JSON.stringify(inc))
  check('incomplete → AI_UNAVAILABLE (retry được, KHÔNG phải INVALID_OUTPUT)', inc.ok === false && inc.code === 'AI_UNAVAILABLE', JSON.stringify(inc))

  const inc2 = parseOpenAiResponse({ status: 'incomplete', incomplete_details: { reason: 'content_filter' }, output: [] })
  check('incomplete/lý do khác → vẫn fail + giữ reason', inc2.ok === false && inc2.reason === 'incomplete_content_filter', JSON.stringify(inc2))

  const ref = parseOpenAiResponse({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] })
  check('refusal → AI_UNAVAILABLE + reason refusal', ref.ok === false && ref.code === 'AI_UNAVAILABLE' && ref.reason === 'refusal', JSON.stringify(ref))

  const noText = parseOpenAiResponse({ output: [{ type: 'reasoning' }] })
  check('chỉ có reasoning, không message → AI_INVALID_OUTPUT/no_output_text',
    noText.ok === false && noText.code === 'AI_INVALID_OUTPUT' && noText.reason === 'no_output_text', JSON.stringify(noText))

  const badJson = parseOpenAiResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'not json' }] }] })
  check('output_text không phải JSON → AI_INVALID_OUTPUT/bad_json',
    badJson.ok === false && badJson.code === 'AI_INVALID_OUTPUT' && badJson.reason === 'bad_json', JSON.stringify(badJson))

  check('body null → fail, không throw', parseOpenAiResponse(null).ok === false)
  check('body rỗng → fail, không throw', parseOpenAiResponse({}).ok === false)
  // Không được lộ nội dung bài thi qua reason (reason là nhãn cố định, không phải dữ liệu).
  check('reason là nhãn cố định [a-z_], không chứa dữ liệu người dùng',
    [inc, ref, noText, badJson].every((x) => /^[a-z_]+$/.test(x.reason)))
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
