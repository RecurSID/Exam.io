# Examio

Examio is a no-login, timed question-paper viewer for lightweight exam sessions. It reveals a paper when the timer starts, automatically removes access when time expires, and presents CQ, MCQ, and combined result views.

## Run locally

No build step or package installation is required.

```bash
python3 -m http.server 4173 --directory dist
```

Then open `http://localhost:4173`.

## Project structure

```text
.
├── .openai/hosting.json     # Static hosting configuration
├── dist/                    # Deployable application
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── config.js
│   ├── supabase.js
│   └── assets/
│       └── question-paper.svg
├── supabase/
│   ├── migrations/          # Schema, grants, RLS, and storage
│   └── functions/start-exam # Server timer and signed paper URL
├── docs/
│   ├── ARCHITECTURE.md
│   ├── BACKEND.md
│   ├── DESIGN-SYSTEM.md
│   ├── DEPLOYMENT.md
│   ├── SECURITY.md
│   └── SUPABASE_SETUP.md
└── README.md
```

## What the prototype includes

- A no-login candidate flow using the administrator's configured duration
- An admin portal for exam timing, metadata, question-paper images, and subject results
- A question paper rendered as a non-draggable image
- Automatic expiry at countdown completion
- Pause-on-tab-loss, watermarking, print blocking, and common capture-key deterrents
- Subject-wise result views with CQ, MCQ, and combined scores
- Responsive, keyboard-friendly layout
- No trackers or paid frontend dependencies

## Important production note

A website cannot reliably stop operating-system screenshots or external cameras. Examio therefore uses deterrents rather than claiming perfect prevention. See [docs/SECURITY.md](docs/SECURITY.md) for the threat model and production recommendations.

## Supabase backend

The frontend is connected to Supabase for authenticated administrators, Postgres result data, private question-paper storage, signed URLs, and server-authoritative exam sessions. Apply the tracked migration and deploy the Edge Function by following [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

