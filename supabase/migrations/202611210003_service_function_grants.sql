-- Edge Functions use service_role to validate schedules, sign private files,
-- and create authoritative anonymous exam sessions. RLS is still enforced for
-- browser roles; these grants apply only to the server-held service credential.
grant select on table public.exams to service_role;
grant select on table public.exam_files to service_role;
grant select, insert, update on table public.exam_sessions to service_role;

