# Turfyslot

Turfyslot is a multi-vendor turf booking application. Google AI Studio is a development environment only; the production deployment is a Docker application intended to run on Coolify with MongoDB Atlas and Redis.

## Local development

Requirements: Node.js 22+, MongoDB Atlas (replica set or sharded cluster), and (for shared rate limiting and BullMQ expiry cleanup) Redis.

1. Copy `.env.example` to `.env` and set MongoDB Atlas credentials, independent JWT secrets, separate 32-byte payout, SMTP, push-subscription, SSLCommerz, ShurjoPay, and UddoktaPay configuration encryption keys, and the UI/API URLs. Keep the keys in a password manager/secret store separate from database backups; losing an encryption key makes its saved credentials unreadable.
2. Install packages with `npm install`.
3. Initialize MongoDB collections and indexes with `npm run db:migrate`.
4. Run `npm run dev:all` to start Vite and the API.
5. Create the first admin once by setting `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` and running `npm run db:seed-admin`.

The API uses MongoDB by default. Set `DB_PROVIDER=mongodb`, `MONGODB_URI`, and optionally `MONGODB_DATABASE`. Atlas must support transactions (a replica set or sharded cluster). One provider is active per deployment; data is not synchronized between providers. MongoDB collections and indexes are initialized on API startup. PostgreSQL remains available by setting `DB_PROVIDER=postgres`; MongoDB deployments use `compose.yaml` and do not start a PostgreSQL service.

### One-time MongoDB-to-PostgreSQL migration

The application does not dual-write or synchronize the two providers. To move a MongoDB deployment to PostgreSQL, first stop application instances that can write to either database and make restorable backups of both databases. Set `DB_PROVIDER=postgres`, configure the destination PostgreSQL connection and source `MONGODB_URI` in `.env`, and keep the same independent encryption keys used by the MongoDB deployment. Run `npm run db:migrate` first, then `npm run db:migrate:mongodb-to-postgres`. The copy command refuses a non-empty PostgreSQL target (apart from the default cancellation policy seeded by migrations), preserves source records and IDs, verifies encrypted values against the configured keys, and leaves MongoDB unchanged. Review the row-count reconciliation before starting the API on PostgreSQL. MongoDB migration history is provider-specific and is not copied.

## Production deployment with Coolify

Deploy this repository as a Docker Compose application using `compose.yaml` with MongoDB Atlas. `compose.mongodb.yaml` is retained as an equivalent explicit MongoDB configuration. Configure the required variables in Coolify's secret/environment settings before starting either stack:

- `CLIENT_URL` and `API_PUBLIC_URL` with the public HTTPS URLs
- Strong, independent `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- `MONGODB_URI` for MongoDB Atlas
- An independent `PAYOUT_ENCRYPTION_KEY`
- `SSLCOMMERZ_CONFIG_ENCRYPTION_KEY`, used to encrypt the SSLCommerz Store Password configured in Admin > Settings > Payment Gateways
- `SHURJOPAY_CONFIG_ENCRYPTION_KEY` and `UDDOKTAPAY_CONFIG_ENCRYPTION_KEY`, independent keys used to encrypt each provider's saved credentials
- `SMTP_CONFIG_ENCRYPTION_KEY` and `PUSH_SUBSCRIPTION_ENCRYPTION_KEY` as independent encryption keys
- Optional `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` to enable browser push notifications; keep the private key server-side

Both Compose files keep Redis off public ports, persist document and queue data in volumes, run a daily private-document backup into a separate volume (30-day retention), and proxy browser API requests through Nginx to Express. The MongoDB Atlas deployment waits for Redis health checks before starting the API. Configure SMTP host, port, sender, TLS mode, username, and password in the admin panel; the password is encrypted before it is stored. Configure off-server backups for Atlas and the `uploads_backup` volume. Do not use the supplied development database credentials in production.

The initial admin is created by the one-time seed command, not public signup. Set the three `ADMIN_*` variables through the deployment environment, then run `npm run db:seed-admin` in the API container. Remove the seed password from deployment configuration after the account is created. Preserve `uploads/private` and database volumes in off-server backups; the verification files must remain private.

## Main API areas

- `GET /health` (also available as `/api/health`): confirms API and selected database connectivity
- `/api/auth/*`: player/owner registration, login, refresh, logout, expiring email verification codes, and single-use password reset codes
- `/api/admin/owners/*`, `/api/admin/turfs/*`: owner and listing review
- `/api/turfs/*`, `/api/owner/turfs/*`: public listing/availability and owner listing management
- `/api/bookings/*`, `/api/payments/sslcommerz/*`: booking holds and gateway callbacks
- `/api/owner/wallet`, `/api/owner/withdrawals`, `/api/admin/withdrawals/*`: wallet and payout review
- `/api/admin/settings/*`, `/api/admin/reports/*`, `/api/admin/disputes/*`: administration

All protected APIs require a bearer access token. Refresh tokens are held in an HTTP-only cookie. Never send database, SMTP, JWT, or payment secrets from browser code.
