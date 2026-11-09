# Turfyslot

Turfyslot is a multi-vendor turf booking application. Google AI Studio is a development environment only; the production deployment is a Docker application intended to run on Coolify with MongoDB (Atlas or a Coolify-hosted replica set) and Redis.

## Local development

Requirements: Node.js 22+, MongoDB on a replica set or sharded cluster (Atlas or self-hosted), and (for shared rate limiting and BullMQ expiry cleanup) Redis.

1. Copy `.env.example` to `.env` and set MongoDB credentials, independent JWT secrets, separate 32-byte payout, SMTP, push-subscription, SSLCommerz, ShurjoPay, and UddoktaPay configuration encryption keys, and the UI/API URLs. Keep the keys in a password manager/secret store separate from database backups; losing an encryption key makes its saved credentials unreadable.
2. Install packages with `npm install`.
3. Initialize MongoDB collections and indexes with `npm run db:migrate`.
4. Run `npm run dev:all` to start Vite and the API.
5. Create the first admin once by setting `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` and running `npm run db:seed-admin`.

The API uses MongoDB by default. Set `DB_PROVIDER=mongodb`, `MONGODB_CONN`, and optionally `MONGODB_DATABASE`. `MONGODB_URI` remains a supported fallback for existing deployments; when both are set, `MONGODB_CONN` takes priority. The selected MongoDB server must support transactions (a replica set or sharded cluster); this applies to Coolify-hosted MongoDB as well as Atlas. One database is active per deployment; data is not synchronized between Atlas and Coolify or between providers. MongoDB collections and indexes are initialized on API startup. PostgreSQL remains available by setting `DB_PROVIDER=postgres`; MongoDB deployments use `compose.yaml` and do not start a PostgreSQL service.

### Move MongoDB Atlas data to Coolify-hosted MongoDB

Changing `MONGODB_CONN` only changes where the app connects; it does not copy data. To preserve the existing Atlas data:

1. Confirm the Coolify MongoDB instance is configured as a replica set or sharded cluster. A standalone MongoDB server is not supported because booking operations require transactions. Keep its database port private on the Coolify network.
2. Schedule a maintenance window, stop app instances that write to Atlas, and create a restorable Atlas backup. Back up the application's upload directories separately; database backups do not include uploaded files.
3. Ensure the destination database has no application data. From a temporary MongoDB Database Tools environment that can reach both Atlas and the private Coolify service, dump the application database and restore it to the destination. Use the same database name on both ends; do not use `--drop`. For example:

   ```sh
   mongodump --uri="$ATLAS_URI" --db="$MONGODB_DATABASE" --archive=atlas.archive.gz --gzip
   mongorestore --uri="$COOLIFY_MONGODB_CONN" --archive=atlas.archive.gz --gzip \
     --nsFrom="${MONGODB_DATABASE}.*" --nsTo="${MONGODB_DATABASE}.*"
   ```

   Supply the URIs through a protected environment/secret mechanism, not in source files or chat. Do not expose the Coolify database publicly just to run this copy.
4. Compare source and destination collection/document counts and verify important accounts, bookings, payments, settings, and audit records. Keep the Atlas source and backup unchanged until the cutover passes its smoke tests.
5. In Coolify's API environment/secrets, set `MONGODB_CONN` to the Coolify MongoDB's private connection string and keep `DB_PROVIDER=mongodb`, `MONGODB_DATABASE`, and all existing encryption keys unchanged. Redeploy the API and confirm `/api/health` succeeds. The app startup also checks MongoDB transaction capability.
6. Test sign-in, turf availability, booking/payment state, owner/admin views, and private/public uploads before resuming traffic. Keep Atlas available as a rollback source; if rolling back, stop writes first and account for any new records created after cutover.

For a Coolify MongoDB service, use the internal host/connection string provided for services on the same Coolify network. Include the service's actual authentication database and replica-set options as provided by its configuration; do not guess the replica-set name.

### One-time MongoDB-to-PostgreSQL migration

The application does not dual-write or synchronize the two providers. To move a MongoDB deployment to PostgreSQL, first stop application instances that can write to either database and make restorable backups of both databases. Set `DB_PROVIDER=postgres`, configure the destination PostgreSQL connection and source `MONGODB_CONN` in `.env`, and keep the same independent encryption keys used by the MongoDB deployment. Run `npm run db:migrate` first, then `npm run db:migrate:mongodb-to-postgres`. The copy command refuses a non-empty PostgreSQL target (apart from the default cancellation policy seeded by migrations), preserves source records and IDs, verifies encrypted values against the configured keys, and leaves MongoDB unchanged. Review the row-count reconciliation before starting the API on PostgreSQL. MongoDB migration history is provider-specific and is not copied.

## Production deployment with Coolify

Deploy this repository as a Docker Compose application using `compose.yaml` with either MongoDB Atlas or a Coolify-hosted MongoDB replica set. `compose.mongodb.yaml` is retained as an equivalent explicit MongoDB configuration. The API joins Coolify's shared network for MongoDB, so the bundled Redis uses the unique `turfyslot-redis` alias to avoid resolving to Coolify's own password-protected Redis service. If `REDIS_URL` is explicitly set in Coolify, set it to `redis://turfyslot-redis:6379`; otherwise, the Compose default uses this address. Configure the required variables in Coolify's secret/environment settings before starting either stack:

- `CLIENT_URL` and `API_PUBLIC_URL` with the public HTTPS URLs
- Strong, independent `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- `MONGODB_CONN` for the selected MongoDB deployment (use its private Coolify service connection string when the database is hosted on the same Coolify network). Existing deployments may continue using `MONGODB_URI`.
- An independent `PAYOUT_ENCRYPTION_KEY`
- `SSLCOMMERZ_CONFIG_ENCRYPTION_KEY`, used to encrypt the SSLCommerz Store Password configured in Admin > Settings > Payment Gateways
- `SHURJOPAY_CONFIG_ENCRYPTION_KEY` and `UDDOKTAPAY_CONFIG_ENCRYPTION_KEY`, independent keys used to encrypt each provider's saved credentials
- `SMTP_CONFIG_ENCRYPTION_KEY` and `PUSH_SUBSCRIPTION_ENCRYPTION_KEY` as independent encryption keys
- Optional `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` to enable browser push notifications; keep the private key server-side

Both Compose files keep Redis off public ports, persist public images and private verification documents on separate volumes, back up both upload directories daily into a separate volume (30-day retention), and proxy browser API and public-image requests through Nginx to Express. The API waits for Redis health checks before starting. Configure SMTP host, port, sender, TLS mode, username, and password in the admin panel; the password is encrypted before it is stored. Configure off-server backups for the selected MongoDB deployment and the `uploads_backup` volume. A Coolify-hosted MongoDB service must be on a private shared network and support replica-set transactions. Do not use the supplied development database credentials in production.

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
