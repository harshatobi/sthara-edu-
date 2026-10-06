-- Website enquiry form now qualifies the pilot: designation, city, size, board, goal.
-- All nullable so earlier rows and older callers stay valid. Service-role only, like the table.
alter table public.enquiries
  add column if not exists designation text check (designation is null or char_length(designation) <= 100),
  add column if not exists city text check (city is null or char_length(city) <= 100),
  add column if not exists student_count integer check (student_count is null or student_count between 1 and 999999),
  add column if not exists board text check (board is null or board in ('cbse','icse','state','ib','cambridge','other')),
  add column if not exists improvement_goal text check (improvement_goal is null or improvement_goal in
    ('learning-gaps','learning-outcomes','teacher-workload','academic-visibility','parent-engagement','explore-ai','full-platform'));
