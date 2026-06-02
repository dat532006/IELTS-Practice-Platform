-- ============================================================
-- Seed dev data — chạy SAU migrations.
-- Supabase CLI: tự chạy khi `supabase db reset` (local).
-- Remote: dán vào SQL editor (chạy như service_role/postgres).
-- ⚠️ KHÔNG seed secret thật; answer_keys ở đây chỉ là mẫu.
-- Idempotent: dùng on conflict / not exists.
-- ============================================================

-- score_bands:
--   • READING = bảng IELTS Academic chuẩn, đặt ở migration `20260602000300` (delete-insert scoped,
--     hội tụ idempotent) — KHÔNG seed reading ở đây nữa (tránh "not exists toàn bảng" che mất cập nhật).
--   • LISTENING = mẫu (W7 hoàn thiện); idempotent SCOPED theo test_type (không phụ thuộc bảng trống).
insert into public.score_bands (test_type, raw_min, raw_max, band)
select * from (values
  ('listening'::public.score_band_type_t, 39, 40, 9.0),
  ('listening', 35, 36, 8.0),
  ('listening', 30, 32, 7.0)
) as v(test_type, raw_min, raw_max, band)
where not exists (select 1 from public.score_bands where test_type = 'listening');

-- Tests: 1 free + 1 premium (passages/questions KHÔNG chứa đáp án)
insert into public.tests (id, slug, title, type, source, is_free, difficulty, question_types, duration_sec, status, passages, questions) values
  ('11111111-1111-1111-1111-111111111111', 'reading-free-1', '[Tự soạn] Reading Free 1', 'reading', 'Tự soạn', true, 2,
   '{gap_filling,mcq}', 3600, 'published',
   '[{"id":"p1","number":1,"title":"Sample Passage","content":"Đoạn văn mẫu tự soạn..."}]'::jsonb,
   '[{"id":"q1","passage_id":"p1","number":1,"type":"gap_filling","instruction":"Write ONE WORD ONLY.","points":1}]'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'reading-premium-1', '[Tự soạn] Reading Premium 1', 'reading', 'Tự soạn', false, 3,
   '{matching,tfng}', 3600, 'published',
   '[{"id":"p1","number":1,"title":"Premium Passage","content":"Nội dung trả phí — chỉ trả khi unlock."}]'::jsonb,
   '[{"id":"q1","passage_id":"p1","number":1,"type":"tfng","instruction":"TRUE / FALSE / NOT GIVEN","points":1}]'::jsonb)
on conflict (slug) do nothing;

-- W6 smoke: Reading multi-type free test (10 câu phủ đủ component types).
-- Upsert theo id cố định để hội tụ trên DB đã seed trước và cả DB đã có attempts trỏ vào fixture.
-- KHÔNG delete public.tests: attempts.test_id không cascade, xóa test sẽ vỡ sau khi đã chạy browser smoke.
insert into public.tests (id, slug, title, type, source, is_free, difficulty, question_types, duration_sec, status, passages, questions) values
  ('66666666-6666-6666-6666-666666666666', 'reading-multi-type-smoke', '[W6 Smoke] Reading Multi-Type', 'reading', 'Dev fixture', true, 2,
   '{gap_filling,summary_completion,mcq,mcq_multi,tfng,ynng,matching_headings,matching_information}', 3600, 'published',
   '[{"id":"p1","number":1,"title":"Climate Change and Urban Planning","content":"Cities around the world are increasingly affected by climate change. Rising temperatures have led to the urban heat island effect, where built-up areas experience significantly higher temperatures than surrounding rural regions. Green infrastructure, including parks, green roofs, and urban forests, has emerged as a key strategy for mitigating these effects.\n\nResearchers at the University of Melbourne found that increasing urban tree canopy cover by 20% could reduce local temperatures by up to 2 degrees Celsius. The study also highlighted the importance of water-sensitive urban design, which integrates natural water cycles into the built environment.\n\nHowever, implementing these changes requires significant investment and long-term political commitment. Many cities in developing countries face additional challenges, including rapid urbanization and limited financial resources. Despite these obstacles, several innovative approaches have been adopted worldwide."},{"id":"p2","number":2,"title":"The History of Renewable Energy","content":"The use of renewable energy sources dates back thousands of years. Ancient civilizations harnessed wind power for sailing and water mills for grinding grain. Solar energy was used by the Greeks and Romans for heating buildings through architectural design.\n\nThe modern era of renewable energy began in the 19th century with the development of hydroelectric power. The first hydroelectric plant was built at Niagara Falls in 1879. Wind turbines for electricity generation were developed in the early 20th century, while solar photovoltaic cells were invented at Bell Labs in 1954.\n\nToday, renewable energy accounts for approximately 30% of global electricity generation, with solar and wind being the fastest-growing sources."}]'::jsonb,
   '[{"id":"q1","passage_id":"p1","number":1,"type":"gap_filling","instruction":"Write ONE WORD ONLY.","prompt":"Green infrastructure includes parks, green roofs, and urban _____."},{"id":"q2","passage_id":"p1","number":2,"type":"summary_completion","instruction":"Complete the summary. Write NO MORE THAN TWO WORDS.","prompt":"Increasing tree canopy cover by 20% could reduce temperatures by up to _____."},{"id":"q3","passage_id":"p1","number":3,"type":"mcq","instruction":"Choose the correct answer.","prompt":"What is the main focus of the first passage?","options":[{"key":"A","text":"Rural temperature changes"},{"key":"B","text":"Urban heat mitigation strategies"},{"key":"C","text":"Financial challenges of city planning"},{"key":"D","text":"Water pollution in cities"}]},{"id":"q4","passage_id":"p1","number":4,"type":"mcq_multi","instruction":"Choose TWO correct answers.","prompt":"Which challenges do developing countries face?","select_count":2,"options":[{"key":"A","text":"Rapid urbanization"},{"key":"B","text":"Excessive green space"},{"key":"C","text":"Limited financial resources"},{"key":"D","text":"Too many parks"}]},{"id":"q5","passage_id":"p1","number":5,"type":"tfng","instruction":"TRUE / FALSE / NOT GIVEN","statement":"The University of Melbourne study focused on rural areas."},{"id":"q6","passage_id":"p1","number":6,"type":"ynng","instruction":"YES / NO / NOT GIVEN","statement":"Do the writers believe green infrastructure is an effective strategy?"},{"id":"q7","passage_id":"p2","number":7,"type":"matching_headings","instruction":"Choose the correct heading for Paragraph 2.","prompt":"Match the heading to Paragraph 2.","options":[{"key":"i","text":"Ancient uses of renewable energy"},{"key":"ii","text":"Modern development of renewable technology"},{"key":"iii","text":"Current global energy statistics"},{"key":"iv","text":"Government policies on energy"}]},{"id":"q8","passage_id":"p2","number":8,"type":"matching_information","instruction":"Which paragraph contains the following information?","prompt":"The invention of solar photovoltaic cells.","options":[{"key":"A","text":"Paragraph 1"},{"key":"B","text":"Paragraph 2"},{"key":"C","text":"Paragraph 3"}]},{"id":"q9","passage_id":"p2","number":9,"type":"gap_filling","instruction":"Write ONE WORD AND/OR A NUMBER.","prompt":"The first hydroelectric plant was built in _____."},{"id":"q10","passage_id":"p2","number":10,"type":"mcq","instruction":"Choose the correct answer.","prompt":"What percentage of global electricity comes from renewables?","options":[{"key":"A","text":"10%"},{"key":"B","text":"20%"},{"key":"C","text":"30%"},{"key":"D","text":"50%"}]}]'::jsonb)
on conflict (id) do update set
  slug = excluded.slug,
  title = excluded.title,
  type = excluded.type,
  source = excluded.source,
  is_free = excluded.is_free,
  difficulty = excluded.difficulty,
  question_types = excluded.question_types,
  duration_sec = excluded.duration_sec,
  status = excluded.status,
  passages = excluded.passages,
  questions = excluded.questions;

-- answer_keys: W1-W2 fixtures (do nothing, stable); W6 fixture upsert để hội tụ khi keys đổi.
insert into public.answer_keys (test_id, keys) values
  ('11111111-1111-1111-1111-111111111111', '{"q1":{"answers":["sample"],"match":"ci"}}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', '{"q1":{"answers":["TRUE"],"match":"ci"}}'::jsonb)
on conflict (test_id) do nothing;

insert into public.answer_keys (test_id, keys) values
  ('66666666-6666-6666-6666-666666666666', '{"q1":{"type":"gap_filling","answers":["forests"],"match":"ci"},"q2":{"type":"summary_completion","answers":["2 degrees","two degrees"],"match":"ci"},"q3":{"type":"mcq_single","answers":["B"],"match":"ci"},"q4":{"type":"mcq_multi","answers":["A","C"],"match":"ci"},"q5":{"type":"tfng","answers":["FALSE"],"match":"ci"},"q6":{"type":"ynng","answers":["YES"],"match":"ci"},"q7":{"type":"matching_headings","answers":["ii"],"match":"ci"},"q8":{"type":"matching_information","answers":["B"],"match":"ci"},"q9":{"type":"gap_filling","answers":["1879"],"match":"ci"},"q10":{"type":"mcq_single","answers":["C"],"match":"ci"}}'::jsonb)
on conflict (test_id) do update set
  keys = excluded.keys;

-- Product bundle (published) chứa premium test
insert into public.products (id, slug, title, description, kind, price_coins, status, sort_order) values
  ('33333333-3333-3333-3333-333333333333', 'reading-vol-1', 'READING VOL 1', 'Bộ đề Reading tự soạn', 'bundle', 100, 'published', 1)
on conflict (slug) do nothing;

insert into public.collection_tests (product_id, test_id, position) values
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 1),
  ('33333333-3333-3333-3333-333333333333', '66666666-6666-6666-6666-666666666666', 2)
on conflict (product_id, test_id) do update set
  position = excluded.position;

refresh materialized view public.product_search;

-- ⚠️ Tạo admin: đăng ký 1 user qua app (hoặc Supabase Auth), rồi chạy (service_role):
--   update public.profiles set role = 'admin' where email = 'you@example.com';
