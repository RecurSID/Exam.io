# Architecture

## Current architecture

Examio is a buildless static application. `index.html` provides semantic structure, `styles.css` owns the responsive design system, `app.js` owns interface state, and `supabase.js` provides the browser API client.

Supabase Postgres stores exam metadata and subject results. Supabase Auth and Row Level Security protect administrator writes. Papers live in a private Storage bucket. The `start-exam` Edge Function creates the authoritative deadline and returns a short-lived signed paper URL. Until the tracked Supabase migration and function are deployed, the bundled demonstration data remains visible as a frontend fallback.

## Runtime architecture

```text
Candidate browser
  -> CDN / static web app
  -> Supabase Data API (published metadata and results)
  -> Supabase Auth (administrator login)
  -> start-exam Edge Function
       -> private Storage signed URL
       -> server-authoritative exam session
```

The server is authoritative for exam start and end times. Paper URLs expire shortly after the configured session duration, while the browser removes the rendered paper at the exact session deadline.

## Recommended free-first stack

- Frontend: this static app on Cloudflare Pages or another static host
- Backend: Supabase Postgres, Auth, Storage, and Edge Functions
- Security: Row Level Security with an `admin` role and private paper bucket
- Files: short-lived signed URLs generated only for active sessions
- Timing: server timestamps and an Edge Function for authoritative session state

See [BACKEND.md](BACKEND.md) for the decision and migration outline. Free tiers and limits change; confirm current provider terms before production launch.

