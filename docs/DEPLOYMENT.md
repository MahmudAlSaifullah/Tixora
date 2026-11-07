# Deploying Tixora

## Requirements

- Node.js 26, the version pinned in `package.json` (`"26.x"`) and `.nvmrc`. On Vercel this overrides the project's Node.js setting. Run on a server or container that keeps running, or on a serverless platform plus a scheduler
- PostgreSQL 14 or newer, with automated backups
- An https domain. Cameras, secure cookies and gateway callbacks all depend on it
- An email provider: any SMTP service, or Resend
- Cloudinary, if you run more than one instance or have no persistent disk

## First deployment

1. Set the environment variables below.
2. Build and migrate:
   ```bash
   npm ci
   npm run build
   npm run db:migrate
   ```
3. Create your first super admin. This also creates the role rows a new database needs:
   ```bash
   ADMIN_EMAIL=you@yourdomain.com ADMIN_PASSWORD='a-long-password1' ADMIN_NAME='Your Name' npm run admin:create
   ```
   Never run `db:seed` in production: its demo accounts share a published password. The seed refuses when `NODE_ENV=production`.
4. Start it with `npm start` behind your https proxy. Check that `/api/health` returns `200`.
5. As the admin, create categories under Admin > Categories, write real policies under Admin > CMS, and set fees and support details under Admin > Settings.

## Environment

See [`.env.example`](../.env.example) for every variable. In production:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` (usually set by your host) |
| `DATABASE_URL` | Production connection string |
| `APP_URL`, `NEXT_PUBLIC_APP_URL` | `https://yourdomain.com`, with no trailing slash. Set `NEXT_PUBLIC_APP_URL` before building |
| `AUTH_SECRET`, `QR_TOKEN_SECRET`, `CRON_SECRET`, `APP_SIGNING_SECRET` | Different random values, each 32+ characters: `openssl rand -base64 48` |
| `PAYMENT_MODE` | `live` once gateways are certified. This also disables the test gateway |
| `EMAIL_PROVIDER`, `EMAIL_FROM` | `smtp` or `resend`, and a sender on your verified domain |
| `STORAGE_PROVIDER` | `cloudinary`, or `local` with `UPLOADS_DIR` on a persistent disk |
| `DB_POOL_MAX` | Connections per instance (default 20). Keep instances × this under your database's limit |

Keep these only in your host's secret store, and rotate them if exposed. **Rotating `QR_TOKEN_SECRET` invalidates every issued QR code**, so don't rotate it close to an event. Rotating `AUTH_SECRET` logs everyone out. Rotating `APP_SIGNING_SECRET` breaks guest order links already sent by email.

## Scheduled jobs

Long-running servers do this automatically. On serverless, set `DISABLE_BACKGROUND_JOBS=true` and call these with `Authorization: Bearer $CRON_SECRET`:

| Path | Suggested schedule | Purpose |
|---|---|---|
| `/api/cron/release-reservations` | Every minute | Release expired holds |
| `/api/cron/reconcile-payments` | Every 10 minutes | Settle payments whose callback never arrived |
| `/api/cron/complete-events` | Every 10 minutes | Mark finished events completed |
| `/api/cron/event-reminders` | Hourly | Remind ticket holders 24-48 hours ahead. Each booking gets one |
| `/api/cron/prune` | Daily | Remove expired rate-limit rows |

## Payment gateways

All gateway code runs on the server. Set credentials and restart, and the method appears at checkout. `PAYMENT_MODE=sandbox` uses each provider's sandbox and `live` uses production. Admin > Payments shows which gateways are active.

> **Status:** these three adapters follow each provider's published API, but **they have not been run against the real services, because no credentials were available.** Before going live, test each one end to end in its sandbox: success, failure, cancellation, and a refund.

### SSLCommerz (Visa, Mastercard, Amex, mobile banking)

- **Sign up:** https://developer.sslcommerz.com/registration/ for a sandbox store. Production needs a merchant agreement.
- **Credentials:** `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`.
- **Dashboard:** set the IPN URL to `https://yourdomain.com/api/payments/webhook/sslcommerz`.

### bKash (Tokenized Checkout)

- **Credentials**, from your bKash account manager: `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD`.
- **Check in sandbox:** the return URL already contains a query string. Confirm bKash appends its `paymentID` and `status` to it correctly.

### Nagad

- **Credentials**, from Nagad merchant onboarding: `NAGAD_MERCHANT_ID`, `NAGAD_MERCHANT_NUMBER`, `NAGAD_MERCHANT_PRIVATE_KEY`, `NAGAD_PUBLIC_KEY` (base64 key bodies, without the PEM header lines).
- **Refunds:** done in Nagad's merchant portal, then recorded with Admin > Refunds > Mark refunded.
- **Check in sandbox:** the RSA key formats and request headers, including whether Nagad requires `X-KM-IP-V4` to hold your server's real IP.

### Test gateway

`PAYMENT_TEST_GATEWAY_ENABLED=true` adds a clearly labelled option where a tester chooses the outcome. It can't run when `PAYMENT_MODE=live`. Turn it off on any public staging site whose tickets could be mistaken for real ones.

## Google login

Create an OAuth client at https://console.cloud.google.com/apis/credentials with redirect URI `https://yourdomain.com/api/auth/callback/google`, then set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. The button appears only when both are set. This flow hasn't been tested against Google, so try it before launch.

## Email

Set `EMAIL_PROVIDER=smtp` with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, or `EMAIL_PROVIDER=resend` with `RESEND_API_KEY`. Configure SPF and DKIM on your sending domain so tickets don't land in spam. Failures are recorded in the `EmailLog` table and never block a paid booking.

## Backup and recovery

The database holds all money and ticket state, so it's the thing to protect.

**Backups**
- Prefer your provider's automated backups with point-in-time recovery (PITR), kept for at least 30 days.
- Otherwise, run a nightly dump and store it encrypted, away from the database server:
  ```bash
  pg_dump --format=custom --no-owner "$DATABASE_URL" > tixora-$(date +%F).dump
  ```
- With `STORAGE_PROVIDER=local`, also back up `UPLOADS_DIR`. Cloudinary keeps its own copies.
- Keep your environment secrets in a separate secure store. **Without `QR_TOKEN_SECRET`, restored tickets can't be scanned.**

**Restore**
1. Stop the app, so nothing writes during the restore.
2. Restore into an empty database:
   ```bash
   pg_restore --no-owner --dbname="$DATABASE_URL" tixora-YYYY-MM-DD.dump
   npm run db:migrate
   ```
3. Start the app, then check `/api/health`, log in, and open a recent order.
4. Run `/api/cron/reconcile-payments`. Payments made since the backup won't exist in the database, so compare the gateway's merchant report against Admin > Payments for that window and resolve any differences by hand.

Test a restore at least once before launch, and periodically after that.

## Launch checklist

- [ ] `PAYMENT_MODE=live`, and each gateway tested end to end in its sandbox
- [ ] A real email provider configured, with SPF and DKIM set
- [ ] Sample policy text replaced under Admin > CMS, reviewed by a legal adviser
- [ ] Fees, VAT and commission confirmed with your accountant under Admin > Settings
- [ ] Social links and support details replaced under Admin > Settings
- [ ] Backups running, and a restore tested
- [ ] The scanner tried on real phones, in real lighting, over https
- [ ] A load test at your expected on-sale traffic, and database pool sizes checked
- [ ] An independent security review before handling real money
