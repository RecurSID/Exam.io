# Supabase setup

The browser integration is configured for project `cvvtqbbkpcbifgtevjrc`. The publishable key in `dist/config.js` is intentionally public; database and storage access are restricted by the migration's grants and Row Level Security policies.

## Deploy the backend

Authenticate and link the repository with the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref cvvtqbbkpcbifgtevjrc
```

Apply the tracked schema, grants, policies, and private storage bucket:

```bash
npx supabase db push
```

Deploy the public session-start function:

```bash
npx supabase functions deploy start-exam --no-verify-jwt
```

Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function. Do not add a secret or service-role key to this repository.

## Create the first administrator

1. In Supabase Dashboard, open **Authentication → Users** and create the administrator account.
2. Open **SQL Editor** and run this one-time data update, replacing the email:

```sql
update public.profiles
set role = 'admin'
where id = (
  select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
);
```

The user can then sign in through Examio's Admin tab. Candidate access remains login-free.

## Security model

- Anonymous visitors can read only published exam metadata and published results.
- The private `paper_path` column is not granted to anonymous visitors.
- Only authenticated users with `profiles.role = 'admin'` can change exams, results, or question-paper objects.
- Question papers are stored in a private bucket.
- The `start-exam` function validates the published exam, creates a server-timed session, and returns a short-lived signed paper URL.
- The secret/service-role key exists only inside the Edge Function environment.

## Verify

After deployment:

1. Sign into the Admin tab.
2. Upload a question-paper image and publish the exam.
3. Publish at least one subject result.
4. Sign out or use a private browser window.
5. Confirm the candidate can start the exam but cannot access the paper before starting.

