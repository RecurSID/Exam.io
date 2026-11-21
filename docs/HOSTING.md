# Hosting Examio

## Recommendation

Use GitHub Pages for the current personal or educational release. Examio is a static HTML/CSS/JavaScript frontend and Supabase already provides authentication, data, storage, and the Edge Function, so the frontend host does not need server-side compute.

The tracked `.github/workflows/pages.yml` publishes `dist/` whenever `main` is updated.

## Enable GitHub Pages

1. Open **GitHub → RecurSID/Exam.io → Settings → Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Open the **Actions** tab and run **Deploy Examio to GitHub Pages**, or push a new commit to `main`.
4. The default project URL will be `https://recursid.github.io/Exam.io/`.

Relative asset URLs are used throughout the application, so it works under the `/Exam.io/` project path.

## Vercel alternative

Vercel also works with these settings:

- Framework preset: **Other**
- Build command: leave empty
- Output directory: `dist`

Vercel offers automatic preview deployments and a convenient custom-domain workflow. Its free Hobby plan is restricted to personal, non-commercial use.

## Commercial use

Review the host's current acceptable-use terms before offering Examio commercially. GitHub Pages is intended primarily for project sites and is not a free host for commercial SaaS; Vercel Hobby is also limited to personal, non-commercial usage.

