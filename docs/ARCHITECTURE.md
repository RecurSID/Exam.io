# Architecture

## Current prototype

Examio is a buildless static application. `index.html` provides semantic structure, `styles.css` owns the responsive design system, and `app.js` owns timer state, view switching, privacy deterrents, and demo result rendering. The paper is an SVG image asset so the prototype can be deployed without object storage.

Exam configuration and demo results use browser storage so the admin workflow can be tested without infrastructure. This is not authoritative storage and must be replaced before real examinations.

## Recommended production architecture

```text
Candidate browser
  -> CDN / static web app
  -> HTTPS API
       -> exam-session service
       -> result service
       -> audit event stream
       -> signed object-storage URLs for question papers
```

The server must be authoritative for exam start and end times. Paper URLs should be short-lived, scoped to one session, and invalidated when the session expires. Results and audit events should be stored server-side.

## Recommended free-first stack

- Frontend: this static app on Cloudflare Pages or another static host
- Backend: Supabase Postgres, Auth, Storage, and Edge Functions
- Security: Row Level Security with an `admin` role and private paper bucket
- Files: short-lived signed URLs generated only for active sessions
- Timing: server timestamps and an Edge Function for authoritative session state

See [BACKEND.md](BACKEND.md) for the decision and migration outline. Free tiers and limits change; confirm current provider terms before production launch.

