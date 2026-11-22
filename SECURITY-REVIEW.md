# TurfySlot Security, Build, Test, and Responsive Review

Reviewed on: 2026-11-22

## Security Findings

| Severity | File | Lines | Vulnerability | Confidence |
|---|---|---:|---|---:|
| HIGH | turf.txt | 1-29 | Plaintext production-looking credentials, including database, admin, SSLCommerz, and email-provider secrets, are stored in the repository. | 10/10 |
| RESOLVED | server.js, deploy/nginx.conf | 412; 9 | A restrictive CSP is configured on the API and the Nginx-served production frontend, with Meta and Google tracking limited to consent-gated loading. | 10/10 |

## Required Secret Response

Because `turf.txt` contains live-looking credentials:

1. Revoke and rotate every exposed credential.
2. Remove `turf.txt` from the repository.
3. Purge it from Git history.
4. Store replacements only in Coolify/deployment secrets or a local ignored `.env`.
5. Review database, payment, email, and admin access logs for unauthorized use.

Do not commit any replacement credential values.

## Existing Security Controls Observed

- JWT access validation is paired with database-backed role/status and token-version checks.
- Refresh tokens use an HttpOnly, `SameSite=Lax`, production `Secure` cookie.
- Refresh-token use rotates the token version.
- Login, registration, verification, refresh, payment, and callback requests have rate limiters.
- Private owner documents are served through authenticated, role-scoped endpoints with no-store and document CSP headers.
- Public image uploads are separated from private verification documents.
- Admin destructive database operations require a database-backed admin role and explicit confirmation.
- Multer limits uploaded documents and profile/image inputs are validated.
- Build dependencies include Helmet and express-rate-limit.

## CSP Status

A restrictive CSP is configured on the API and the Nginx-served production frontend. It restricts scripts to the application and the consent-enabled Meta and Google tag hosts, and permits only the external origins needed for fonts, maps, image tiles, and tracking requests. Inline styles remain allowed for existing UI libraries; inline scripts and `unsafe-eval` are not allowed. The local Nginx configuration could not be syntax-tested because the Docker engine is unavailable in this environment.

## Validation Results

| Check | Result |
|---|---|
| TypeScript typecheck (`npm run lint`) | Passed |
| Production frontend build (`npm run build`) | Passed |
| Role backup restore tests | 10/10 passed |
| Admin password reset tests | 4/4 passed |
| First-admin creation tests | 4/4 passed |
| MongoDB connection configuration tests | 3/3 passed |
| Database provider integration test | Skipped: `TEST_DB_PROVIDER` was not configured |

The build emitted only a bundle-size warning for several large chunks.

## Runtime and Responsive Results

- A Vite browser probe loaded the TurfySlot frontend.
- A 360px mobile viewport probe showed no document-level horizontal overflow (`documentElement.scrollWidth` did not exceed the viewport width).
- The layout displayed responsive navigation and a mobile filter screen.
- API-backed content could not load in the local browser probe because the backend runtime was not connected to Redis/MongoDB, and the frontend returned 500/invalid-JSON responses.
- Redis and database connectivity must be verified in the deployment environment before an API-dependent end-to-end browser pass can pass.
