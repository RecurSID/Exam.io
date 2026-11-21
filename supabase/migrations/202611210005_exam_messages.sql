alter table public.exams
  add column if not exists student_note text not null default '',
  add column if not exists announcement text not null default '';

grant select (student_note, announcement) on table public.exams to anon;

comment on column public.exams.student_note is 'Optional student-facing note shown with this exam.';
comment on column public.exams.announcement is 'Optional student-facing announcement shown prominently with this exam.';

