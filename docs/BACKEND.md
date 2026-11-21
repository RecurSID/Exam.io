# Backend recommendation

## Decision

Use **Supabase** for the first production version of Examio.

Examio's core data is relational: exams have subjects, papers, schedules, CQ/MCQ components, candidates, and subject-wise results. PostgreSQL fits this model naturally. Supabase combines Postgres, administrator authentication, file storage, Row Level Security, realtime updates, and server functions in one approachable platform.

## Why not the alternatives first

- Firebase is excellent for fast realtime client apps, but subject-wise reporting is easier to query and validate in SQL. Cloud Storage for Firebase also requires the Blaze billing plan even when usage remains inside no-cost allowances.
- AWS provides the most control and a strong long-term architecture, but Cognito, API Gateway, Lambda, DynamoDB, S3, IAM, and monitoring create significantly more setup and operational work for this stage.

## Initial schema

```text
profiles       id, role, display_name
subjects       id, name, code
exams          id, subject_id, title, class_name, duration_minutes,
               full_marks, starts_at, ends_at, status
papers         id, exam_id, storage_path, checksum
results        id, exam_id, candidate_ref, cq_score, mcq_score,
               cq_total, mcq_total, teacher_note, published_at
exam_sessions  id, exam_id, candidate_ref, started_at, expires_at, status
```

Question papers belong in a private storage bucket. The candidate should receive only a short-lived signed URL after the server confirms an active session. Admin routes require Supabase Auth and an `admin` role enforced by Row Level Security—not merely hidden navigation.

## Migration steps

1. Create the tables and Row Level Security policies.
2. Add admin email/password or magic-link authentication.
3. Move paper uploads from browser storage to a private bucket.
4. Replace local exam settings and results with database queries.
5. Add an Edge Function to start a session and return the authoritative expiry time.
6. Log focus-loss and session events with an explicit retention policy.

Official references: [Supabase pricing](https://supabase.com/pricing), [Firebase pricing](https://firebase.google.com/pricing), [Firebase Storage billing requirement](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), and [AWS serverless free tier](https://aws.amazon.com/free/serverless/).
