# Backend recommendation

## Decision

Use **Supabase** for the first production version of Examio.

Examio's core data is relational: exams have subjects, papers, schedules, CQ/MCQ components, candidates, and subject-wise results. PostgreSQL fits this model naturally. Supabase combines Postgres, administrator authentication, file storage, Row Level Security, realtime updates, and server functions in one approachable platform.

## Why not the alternatives first

- Firebase is excellent for fast realtime client apps, but subject-wise reporting is easier to query and validate in SQL. Cloud Storage for Firebase also requires the Blaze billing plan even when usage remains inside no-cost allowances.
- AWS provides the most control and a strong long-term architecture, but Cognito, API Gateway, Lambda, DynamoDB, S3, IAM, and monitoring create significantly more setup and operational work for this stage.

## Implemented schema

```text
profiles       id, role, created_at
exams          id, title, subject, class_name, duration_minutes,
               full_marks, paper_path, status, timestamps
results        id, subject, cq_score, mcq_score, cq_total,
               mcq_total, teacher_note, published_at
exam_sessions  id, exam_id, started_at, expires_at, status
```

Question papers belong in a private storage bucket. The candidate should receive only a short-lived signed URL after the server confirms an active session. Admin routes require Supabase Auth and an `admin` role enforced by Row Level Security—not merely hidden navigation.

## Deployment

The schema, RLS policies, private bucket, browser client, administrator authentication, and session-start Edge Function are implemented in this repository. Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) to deploy them to the linked project.

Official references: [Supabase pricing](https://supabase.com/pricing), [Firebase pricing](https://firebase.google.com/pricing), [Firebase Storage billing requirement](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), and [AWS serverless free tier](https://aws.amazon.com/free/serverless/).
