-- ============================================================
-- Seed dev data — chạy SAU migrations.
-- Supabase CLI: tự chạy khi `supabase db reset` (local).
-- Remote: dán vào SQL editor (chạy như service_role/postgres).
-- ⚠️ KHÔNG seed secret thật; answer_keys ở đây chỉ là mẫu.
-- Idempotent: dùng on conflict / not exists.
-- ============================================================

-- score_bands:
--   • READING   = IELTS Academic chuẩn, ở migration `20260602000300` (delete-insert scoped, hội tụ).
--   • LISTENING = IELTS Academic chuẩn, ở migration `20260603000200` (W7, delete-insert scoped, hội tụ).
--   KHÔNG seed score_bands ở đây nữa (tránh "not exists toàn bảng" che mất cập nhật bảng chuẩn).

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

-- W7 Listening fixtures: free + premium (audio_key = R2 object key, SERVER-ONLY — KHÔNG grant client).
--   passages = thông tin section (KHÔNG transcript/đáp án); questions = gap/form/label/map/matching/mcq.
--   Upsert theo id cố định (an toàn với attempts đã trỏ vào). duration_sec 1800 (30').
insert into public.tests (id, slug, title, type, source, is_free, difficulty, question_types, duration_sec, status, passages, questions, audio_key) values
  ('77777777-7777-7777-7777-777777777777', 'listening-free-1', '[W7 Smoke] Listening Free 1', 'listening', 'Dev fixture', true, 2,
   '{form_completion,gap_filling,diagram_label,map_labelling,matching_features,mcq}', 1800, 'published',
   '[{"id":"s1","number":1,"title":"Section 1 — Enquiry call","content":"Nghe đoạn hội thoại và trả lời câu hỏi 1-3."},{"id":"s2","number":2,"title":"Section 2 — Tour & diagram","content":"Nghe và trả lời câu hỏi 4-5 (sơ đồ/bản đồ)."},{"id":"s3","number":3,"title":"Section 3 — Discussion","content":"Nghe thảo luận và trả lời câu hỏi 6-7."},{"id":"s4","number":4,"title":"Section 4 — Lecture","content":"Nghe bài giảng và trả lời câu hỏi 8-10."}]'::jsonb,
   '[{"id":"q1","section_id":"s1","number":1,"type":"form_completion","instruction":"Write ONE WORD ONLY.","prompt":"The caller wants to join the local _____."},{"id":"q2","section_id":"s1","number":2,"type":"form_completion","instruction":"Write the surname.","prompt":"Surname:"},{"id":"q3","section_id":"s1","number":3,"type":"gap_filling","instruction":"Write the time.","prompt":"The first class starts at _____."},{"id":"q4","section_id":"s2","number":4,"type":"diagram_label","instruction":"Label the diagram. Write ONE WORD ONLY.","prompt":"Part X of the device is the _____.","image":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAzMjAgMTgwJz48cmVjdCB3aWR0aD0nMzIwJyBoZWlnaHQ9JzE4MCcgZmlsbD0nI2YxZjVmOScvPjxyZWN0IHg9Jzk1JyB5PSc1NScgd2lkdGg9JzEzMCcgaGVpZ2h0PSc3MCcgZmlsbD0nI2NiZDVlMScgc3Ryb2tlPScjNDc1NTY5JyBzdHJva2Utd2lkdGg9JzInLz48Y2lyY2xlIGN4PScxNjAnIGN5PSc0NScgcj0nOScgZmlsbD0nIzk0YTNiOCcgc3Ryb2tlPScjNDc1NTY5Jy8+PHRleHQgeD0nMTYwJyB5PScxNjUnIGZvbnQtc2l6ZT0nMTMnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZpbGw9JyMzMzQxNTUnPkRldmljZSBjcm9zcy1zZWN0aW9uPC90ZXh0Pjwvc3ZnPg==","x":50,"y":25},{"id":"q5","section_id":"s2","number":5,"type":"map_labelling","instruction":"Choose the correct letter A-D on the map.","prompt":"Where is the reception desk?","options":[{"key":"A","text":"North wing"},{"key":"B","text":"East wing"},{"key":"C","text":"South wing"},{"key":"D","text":"West wing"}]},{"id":"q6","section_id":"s3","number":6,"type":"matching_features","instruction":"Match the speaker to the opinion. Choose A-D.","prompt":"Speaker 1","options":[{"key":"A","text":"Strongly agrees"},{"key":"B","text":"Disagrees"},{"key":"C","text":"Is unsure"},{"key":"D","text":"Has no opinion"}]},{"id":"q7","section_id":"s3","number":7,"type":"matching_features","instruction":"Match the speaker to the opinion. Choose A-D.","prompt":"Speaker 2","options":[{"key":"A","text":"Strongly agrees"},{"key":"B","text":"Disagrees"},{"key":"C","text":"Is unsure"},{"key":"D","text":"Has no opinion"}]},{"id":"q8","section_id":"s4","number":8,"type":"mcq","instruction":"Choose the correct answer.","prompt":"What is the lecture mainly about?","options":[{"key":"A","text":"Ancient history"},{"key":"B","text":"Marine biology"},{"key":"C","text":"Economics"},{"key":"D","text":"Physics"}]},{"id":"q9","section_id":"s4","number":9,"type":"gap_filling","instruction":"Write ONE WORD ONLY.","prompt":"The next session will be held on _____."},{"id":"q10","section_id":"s4","number":10,"type":"mcq","instruction":"Choose the correct answer.","prompt":"How many students attended the seminar?","options":[{"key":"A","text":"10"},{"key":"B","text":"20"},{"key":"C","text":"30"},{"key":"D","text":"40"}]}]'::jsonb,
   'listening/free-sample-1.mp3'),
  ('88888888-8888-8888-8888-888888888888', 'listening-premium-1', '[W7 Smoke] Listening Premium 1', 'listening', 'Dev fixture', false, 3,
   '{form_completion,gap_filling,matching_features,mcq}', 1800, 'published',
   '[{"id":"s1","number":1,"title":"Section 1","content":"Nội dung trả phí — chỉ trả khi unlock."}]'::jsonb,
   '[{"id":"q1","section_id":"s1","number":1,"type":"form_completion","instruction":"Write ONE WORD ONLY.","prompt":"Premium listening gap 1:"},{"id":"q2","section_id":"s1","number":2,"type":"mcq","instruction":"Choose the correct answer.","prompt":"Premium listening MCQ:","options":[{"key":"A","text":"Option A"},{"key":"B","text":"Option B"},{"key":"C","text":"Option C"}]}]'::jsonb,
   'listening/premium-1.mp3')
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
  questions = excluded.questions,
  audio_key = excluded.audio_key;

-- W10 Writing fixture (AI-graded; KHÔNG answer_keys). passages = 2 task prompts (task1/task2).
--   type='writing'; free để smoke/dev chấm được. duration 3600 (60').
insert into public.tests (id, slug, title, type, source, is_free, difficulty, question_types, duration_sec, status, passages, questions) values
  ('99999999-9999-9999-9999-999999999999', 'writing-task12-free', '[W10] Writing Task 1+2 Free', 'writing', 'Dev fixture', true, 3,
   '{writing_task1,writing_task2}', 3600, 'published',
   '[{"id":"task1","number":1,"title":"Writing Task 1","content":"The chart below shows the percentage of households in owned and rented accommodation in England and Wales between 1918 and 2011. Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words."},{"id":"task2","number":2,"title":"Writing Task 2","content":"Some people believe that universities should focus on providing academic skills, while others think they should prepare students for the workplace. Discuss both views and give your own opinion. Write at least 250 words."}]'::jsonb,
   '[]'::jsonb)
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

-- W7 Listening answer_keys (gap/form/label/map/matching/mcq) — all-correct raw=10 → band 4.0 (listening table).
insert into public.answer_keys (test_id, keys) values
  ('77777777-7777-7777-7777-777777777777', '{"q1":{"type":"form_completion","answers":["library"],"match":"ci"},"q2":{"type":"form_completion","answers":["Smith"],"match":"ci"},"q3":{"type":"gap_filling","answers":["9:30","9.30","9 30"],"match":"ci"},"q4":{"type":"diagram_label","answers":["valve"],"match":"ci"},"q5":{"type":"map_labelling","answers":["B"],"match":"ci"},"q6":{"type":"matching_features","answers":["A"],"match":"ci"},"q7":{"type":"matching_features","answers":["C"],"match":"ci"},"q8":{"type":"mcq_single","answers":["B"],"match":"ci"},"q9":{"type":"gap_filling","answers":["Tuesday"],"match":"ci"},"q10":{"type":"mcq_single","answers":["C"],"match":"ci"}}'::jsonb),
  ('88888888-8888-8888-8888-888888888888', '{"q1":{"type":"form_completion","answers":["premium"],"match":"ci"},"q2":{"type":"mcq_single","answers":["B"],"match":"ci"}}'::jsonb)
on conflict (test_id) do update set
  keys = excluded.keys;

-- Product bundle (published) chứa premium test
insert into public.products (id, slug, title, description, kind, price_coins, status, sort_order) values
  ('33333333-3333-3333-3333-333333333333', 'reading-vol-1', 'READING VOL 1', 'Bộ đề Reading tự soạn', 'bundle', 100, 'published', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'listening-vol-1', 'LISTENING VOL 1', 'Bộ đề Listening tự soạn', 'bundle', 100, 'published', 2)
on conflict (slug) do nothing;

insert into public.collection_tests (product_id, test_id, position) values
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 1),
  ('33333333-3333-3333-3333-333333333333', '66666666-6666-6666-6666-666666666666', 2),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888888', 1)
on conflict (product_id, test_id) do update set
  position = excluded.position;

refresh materialized view public.product_search;

-- ⚠️ Tạo admin: đăng ký 1 user qua app (hoặc Supabase Auth), rồi chạy (service_role):
--   update public.profiles set role = 'admin' where email = 'you@example.com';
