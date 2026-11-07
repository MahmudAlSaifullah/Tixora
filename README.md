# Tixora

Online event ticketing and management platform for Bangladesh: a customer website, organizer portal, super admin dashboard, booking engine, digital QR tickets, and a mobile gate scanner.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Prisma 7, PostgreSQL, Auth.js, Zod, React Hook Form.

| Document | Contents |
|---|---|
| This file | Setup, demo logins, project structure, testing |
| [docs/API.md](docs/API.md) | REST API and server actions |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema overview and integrity rules |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production setup, payment gateways, admin creation, backups |
| [prisma/schema.prisma](prisma/schema.prisma) | The authoritative schema |
| [.env.example](.env.example) | Every environment variable |

## Getting started

You need Node.js 20.9 or newer and PostgreSQL 14 or newer.

```bash
npm install
cp .env.example .env            # then generate the four secrets (see the file's comments)
docker compose up -d            # or point DATABASE_URL at your own PostgreSQL
npm run db:create               # creates the database and its _test sibling
npm run db:migrate              # applies migrations
npm run db:seed                 # loads demo data
npm run dev                     # http://localhost:3000
```

`npm run db:reset` wipes the development database and reseeds it. It refuses to run when `NODE_ENV=production`.

### This machine (Windows, no system Node or Docker)

A portable Node and PostgreSQL were placed in `.toolchain/`, with data in `.data/`. Both are gitignored, and nothing was installed system-wide.

```powershell
. .\scripts\dev-shell.ps1                     # puts the portable Node on PATH for this terminal
powershell -File scripts\local-db.ps1 start   # start | stop | status
npm run dev
```

The `.env` here already has generated secrets, and the database is migrated and seeded.

## Demo logins

The password for every account is `Demo@12345`.

| Role | Email | Lands on |
|---|---|---|
| Super admin | `admin@tixora.test` | `/admin` |
| Organizer | `organizer@tixora.test` | `/organizer/dashboard` |
| Scanner / staff | `scanner@tixora.test` | `/scanner` |
| Customer | `customer@tixora.test` | `/my-tickets` |

More customers: `customer1@tixora.test` to `customer24@tixora.test`. More organizers: `runbd@`, `baysports@`, `campus@`, `kolpo@tixora.test`. An organizer awaiting approval: `neworg@tixora.test`.

Demo promo codes: `WELCOME10` (10%, once per customer), `NEON200` (৳200 off Neon Monsoon, minimum ৳1,000), `RUNTOGETHER` (15% off RunBD events), `EXPIRED50` (expired, for testing the error).

Seeded events are fictional and shown with a "Demo" label. Cover photos in `public/demo/covers` are from Unsplash, under the Unsplash License.

## Trying a purchase

1. Log in as the customer and open any event. Choose tickets and go through the wizard.
2. On the payment page, choose **Test gateway**. It's labelled TEST MODE, and no money moves.
3. Choose a success, failure or cancellation. The order page shows the booking's real state.
4. Open the ticket, or download its PDF. To check emails, see `.data/emails`: with `EMAIL_PROVIDER=log` messages are written there rather than sent, and any links in them work.
5. Log in as the scanner, open `/scanner`, choose an assigned event and enter the ticket ID. Scanning it twice shows the duplicate warning.

The camera needs `localhost` or an `https` address. To test on a real phone, serve the app over https, for example with a tunnel.

## Project structure

```
prisma/                 schema, migrations (including integrity constraints), demo seed
scripts/                db creation and reset, admin creation, local toolchain helpers
public/demo/            demo event images
src/
  proxy.ts              first-line route protection
  instrumentation.ts    background jobs for self-hosted servers
  app/
    (site)/             public site, auth, checkout, customer account
    organizer/          organizer portal
    admin/              super admin dashboard
    scanner/            gate scanner
    api/                REST route handlers
    uploads/            serves locally stored images
  components/
    ui/                 shadcn/ui primitives
    kit/                page headers, tables, status badges, action forms
    brand/ site/ events/ booking/ tickets/ scanner/ organizer/ dashboard/ auth/
    charts/             SVG charts and the analytics board
  lib/                  code shared with the browser: money, dates, validation schemas
  server/
    auth/               Auth.js config, password hashing, role and ownership guards
    services/           business logic: booking, inventory, payment, refund, check-in, promo,
                        commission, analytics, event management, exports, notifications
    payments/           gateway contract, registry, adapters (SSLCommerz, bKash, Nagad, test)
    tickets/            QR tokens and PDF rendering
    email/              templates and transports
    actions/            server actions for account, organizer and admin forms
tests/                  engine tests against real PostgreSQL (Vitest)
tests/e2e/              browser journeys against a production build (Playwright)
```

## How the critical parts work

- **No overselling.** Stock moves through conditional SQL updates (`total - reserved - sold >= quantity`), and a `CHECK` constraint backs them up.
- **Reservations.** A booking holds stock until its deadline (configurable under Admin > Settings). Expired holds are released on a schedule and whenever someone books that event.
- **Payments.** The server sets every amount. Callbacks and webhooks only prompt a server-to-server status check with the gateway. Only that check can confirm a booking, and it must match the amount exactly.
- **Idempotency.** Callback handling locks the payment row, so replays and races issue tickets once. A payment that arrives after the seats are gone, or a second payment on a paid booking, goes to review with a refund opened.
- **QR tokens.** A code contains only an opaque HMAC-derived token. The database stores just its SHA-256, so neither the code nor a database leak reveals a usable ticket or customer details.
- **Check-in.** Admission is one conditional update, and a partial unique index allows one accepted check-in per ticket.
- **Data isolation.** The organization always comes from the caller's membership, never from client input, and each query filters by it.

## Testing

```bash
npm run typecheck
npm run lint
npm test                 # engine tests, on the *_test database
npm run build            # the E2E suite runs against this production build
npm run test:e2e         # browser tests, on a separate *_e2e database, wiped each run
```

Engine tests cover concurrent booking, promo limits, payment replay and forgery, late and duplicate payments, refunds and check-in races. Browser tests cover every role's main journeys, access control, data isolation, a real camera scan using a fake webcam, and layouts from 360px to 1920px.
