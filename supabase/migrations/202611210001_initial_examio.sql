create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  class_name text not null,
  duration_minutes integer not null check (duration_minutes between 1 and 360),
  full_marks integer not null check (full_marks > 0),
  paper_path text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  subject text not null unique,
  cq_score numeric(8,2) not null check (cq_score >= 0),
  cq_total numeric(8,2) not null check (cq_total > 0 and cq_score <= cq_total),
  mcq_score numeric(8,2) not null check (mcq_score >= 0),
  mcq_total numeric(8,2) not null check (mcq_total > 0 and mcq_score <= mcq_total),
  teacher_note text not null default '',
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  started_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'expired')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.exams enable row level security;
alter table public.results enable row level security;
alter table public.exam_sessions enable row level security;

revoke all on table public.profiles, public.exams, public.results, public.exam_sessions from anon, authenticated;
grant select on table public.profiles to authenticated;
grant select (id, title, subject, class_name, duration_minutes, full_marks, status, updated_at) on table public.exams to anon;
grant select, insert, update, delete on table public.exams to authenticated;
grant select on table public.results to anon, authenticated;
grant insert, update, delete on table public.results to authenticated;

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Visitors read published exam metadata"
  on public.exams for select to anon
  using (status = 'published');
create policy "Admins read exams"
  on public.exams for select to authenticated
  using ((select public.is_admin()));
create policy "Admins create exams"
  on public.exams for insert to authenticated
  with check ((select public.is_admin()));
create policy "Admins update exams"
  on public.exams for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete exams"
  on public.exams for delete to authenticated
  using ((select public.is_admin()));

create policy "Visitors read published results"
  on public.results for select to anon
  using (published_at is not null);
create policy "Admins read results"
  on public.results for select to authenticated
  using ((select public.is_admin()));
create policy "Admins create results"
  on public.results for insert to authenticated
  with check ((select public.is_admin()));
create policy "Admins update results"
  on public.results for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete results"
  on public.results for delete to authenticated
  using ((select public.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-papers', 'question-papers', false, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins view question papers"
  on storage.objects for select to authenticated
  using (bucket_id = 'question-papers' and (select public.is_admin()));
create policy "Admins upload question papers"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'question-papers' and (select public.is_admin()));
create policy "Admins update question papers"
  on storage.objects for update to authenticated
  using (bucket_id = 'question-papers' and (select public.is_admin()))
  with check (bucket_id = 'question-papers' and (select public.is_admin()));
create policy "Admins delete question papers"
  on storage.objects for delete to authenticated
  using (bucket_id = 'question-papers' and (select public.is_admin()));

comment on table public.exams is 'Exam settings and private paper paths managed by administrators.';
comment on table public.results is 'Published subject-wise CQ and MCQ results.';
comment on table public.exam_sessions is 'Server-authoritative no-login exam sessions created by the start-exam function.';

