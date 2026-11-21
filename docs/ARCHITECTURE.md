# Architecture

## Current architecture

Examio is a buildless static application. `index.html` provides semantic structure, `styles.css` owns the responsive design system, `app.js` owns interface state, and `supabase.js` provides the browser API client.

Supabase Postgres stores scheduled exams, ordered paper-file metadata, and exam-specific subject results. Supabase Auth and Row Level Security protect administrator writes. Images and PDFs live in a private Storage bucket. The `start-exam` Edge Function validates the schedule, creates the authoritative deadline, and returns short-lived signed URLs for every paper file.

## Runtime architecture

```text
Candidate browser
  -> CDN / static web app
  -> Supabase Data API (published schedules and results)
  -> Supabase Auth (administrator login)
  -> start-exam Edge Function
       -> private Storage signed URLs
       -> server-authoritative exam session
```

The server is authoritative for exam start and end times. A fixed exam ends for everyone at `starts_at + duration`, so a late starter receives only the remaining time. A flexible exam may begin between `starts_at` and `available_until`; each valid start receives the full duration. Paper URLs expire shortly after that session deadline, while the browser removes all rendered files at the exact deadline.

## Recommended free-first stack

- Frontend: this static app on Cloudflare Pages or another static host
- Backend: Supabase Postgres, Auth, Storage, and Edge Functions
- Security: Row Level Security with an `admin` role and private paper bucket
- Files: short-lived signed URLs generated only for active sessions
- Timing: server timestamps and an Edge Function for authoritative session state

See [BACKEND.md](BACKEND.md) for the decision and migration outline. Free tiers and limits change; confirm current provider terms before production launch.

