alter table public.exams
  add column if not exists availability_mode text,
  add column if not exists starts_at timestamptz,
  add column if not exists available_until timestamptz;

update public.exams
set
  availability_mode = coalesce(availability_mode, 'window'),
  starts_at = coalesce(starts_at, created_at, now()),
  available_until = coalesce(available_until, created_at + interval '24 hours', now() + interval '24 hours');

alter table public.exams
  alter column availability_mode set default 'window',
  alter column availability_mode set not null,
  alter column starts_at set default now(),
  alter column starts_at set not null,
  drop constraint if exists exams_availability_mode_check,
  add constraint exams_availability_mode_check check (availability_mode in ('fixed', 'window')),
  drop constraint if exists exams_schedule_check,
  add constraint exams_schedule_check check (
    (availability_mode = 'fixed' and available_until is null)
    or
    (availability_mode = 'window' and available_until is not null and available_until > starts_at)
  ),
  alter column paper_path drop not null;

create table if not exists public.exam_files (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (exam_id, storage_path)
);

insert into public.exam_files (exam_id, storage_path, file_name, mime_type, sort_order)
select
  id,
  paper_path,
  split_part(paper_path, '/', -1),
  case
    when lower(paper_path) like '%.pdf' then 'application/pdf'
    when lower(paper_path) like '%.png' then 'image/png'
    when lower(paper_path) like '%.webp' then 'image/webp'
    when lower(paper_path) like '%.svg' then 'image/svg+xml'
    else 'image/jpeg'
  end,
  0
from public.exams
where paper_path is not null
on conflict (exam_id, storage_path) do nothing;

alter table public.results add column if not exists exam_id uuid references public.exams(id) on delete cascade;

update public.results
set exam_id = (select id from public.exams order by updated_at desc limit 1)
where exam_id is null;

alter table public.results drop constraint if exists results_subject_key;
alter table public.results drop constraint if exists results_exam_subject_key;
alter table public.results add constraint results_exam_subject_key unique (exam_id, subject);

alter table public.exam_files enable row level security;
revoke all on table public.exam_files from anon, authenticated;
grant select, insert, update, delete on table public.exam_files to authenticated;

create policy "Admins read exam files"
  on public.exam_files for select to authenticated
  using ((select public.is_admin()));
create policy "Admins create exam files"
  on public.exam_files for insert to authenticated
  with check ((select public.is_admin()));
create policy "Admins update exam files"
  on public.exam_files for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete exam files"
  on public.exam_files for delete to authenticated
  using ((select public.is_admin()));

grant select (
  availability_mode,
  starts_at,
  available_until
) on table public.exams to anon;

update storage.buckets
set
  file_size_limit = 26214400,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf']
where id = 'question-papers';

create index if not exists exams_portal_schedule_idx on public.exams (status, starts_at);
create index if not exists exam_files_exam_order_idx on public.exam_files (exam_id, sort_order);
create index if not exists results_exam_idx on public.results (exam_id);

comment on column public.exams.availability_mode is 'fixed: globally timed; window: candidate may start during the configured window.';
comment on column public.exams.starts_at is 'Bangladesh schedule is stored as UTC and rendered in Asia/Dhaka.';
comment on table public.exam_files is 'Ordered image and PDF files belonging to an exam paper.';

