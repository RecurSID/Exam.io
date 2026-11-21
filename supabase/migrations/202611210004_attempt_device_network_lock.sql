alter table public.exam_sessions
  add column if not exists device_hash text,
  add column if not exists ip_hash text,
  add column if not exists last_resumed_at timestamptz;

create unique index if not exists exam_sessions_exam_device_unique
  on public.exam_sessions (exam_id, device_hash)
  where device_hash is not null;

create unique index if not exists exam_sessions_exam_ip_unique
  on public.exam_sessions (exam_id, ip_hash)
  where ip_hash is not null;

create index if not exists exam_sessions_resume_lookup_idx
  on public.exam_sessions (exam_id, device_hash, expires_at);

comment on column public.exam_sessions.device_hash is 'Salted hash of the browser-held anonymous device token.';
comment on column public.exam_sessions.ip_hash is 'Salted hash of the originating public IP; raw addresses are never stored.';

