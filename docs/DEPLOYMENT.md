# Deployment

## Static hosting

Deploy the contents of `dist/`. No build command is required.

### GitHub Pages

Publish `dist/` with a Pages workflow or place its files on the configured Pages branch.

### Cloudflare Pages

- Build command: leave empty
- Output directory: `dist`

### AWS

For a simple AWS deployment, upload `dist/` to an S3 bucket configured behind CloudFront. Keep the S3 bucket private and use Origin Access Control. HTTPS should terminate at CloudFront.

## Production checklist

- Replace the demo SVG with papers served through expiring signed URLs
- Move timer authority to the server
- Add an admin-only paper and result management area
- Add durable result and audit storage
- Set a strict Content Security Policy
- Configure logging, alerting, backups, and a retention policy
- Run accessibility, load, and security testing

