<p align="center">
  <img src="./public/pocket-cfo-logo.svg" alt="POCKET CFO — Know your numbers. Grow your business." width="280" />
</p>

# POCKET CFO

**Know your numbers. Grow your business.**

POCKET CFO is a business-finance workspace for small South African businesses. It turns everyday transactions, customers, quotes and invoices into a clear view of cash flow, owner pay and funding readiness.

Built with **Next.js 16**, **React 19**, **Prisma 7**, **PostgreSQL** and **TypeScript**. Amounts are stored in integer minor units (cents) and displayed in ZAR.

## What is included

### Daily money work
- Dashboard with this month's revenue, expenses, owner draws, estimated cash and runway.
- Six-month cash-flow chart, previous-month comparisons, expense mix and top customers.
- Transaction ledger with search, type/month/category filters, live totals and CSV export.
- Add, edit and delete transactions. Editing pre-fills the full form.
- Budget split across operations, reserve and owner draw, with a 100% validation check.

### Planning and tasks
- Shared team calendar with a month grid, today marker and a day-by-day planner.
- Add tasks with time, duration, priority, assignee, notes and all-day support.
- Tick tasks off in place, reschedule overdue work to today, and see the next seven days at a glance.
- Keyboard-friendly calendar (arrow keys move between days, Home jumps to today).
- Task changes are audited, and created/completed tasks can trigger signed webhooks.

### Customers and documents
- Customer records with lifetime revenue, last activity and open documents.
- Quotes and invoices with multiple line items, quantities, rates and due dates.
- Overdue detection, status tracking (`Draft → Sent → Accepted → Paid`), mark-as-paid.
- Convert a quote into an invoice, print a clean document, or open a pre-filled email.
- Professional invoice preview with business name, customer details and totals.

### Reporting and records
- Funding-readiness score and a practical checklist.
- Month-vs-month profit and cash report, six-month table and expense mix.
- Plain-language audit trail of money, document, account and integration changes.
- One-click full JSON backup and transaction CSV export.

### Admin integrations hub (owner only)
- **Bank statement import** — built in and ready to use. Upload any bank CSV, let POCKET CFO detect the date/description/amount columns, adjust the mapping, preview every row, then import. Duplicate rows are fingerprinted and skipped.
- **Real-time webhooks** — send signed events to Slack, Make, Zapier or your own HTTPS endpoint. Deliveries include `X-PocketCFO-Signature: sha256=…` (HMAC-SHA256 of the raw body).
- **PayFast credentials** — store merchant details securely as the foundation for online invoice payments.
- Credentials are encrypted with **AES-256-GCM** before storage and are never returned to the browser in plain text.
- Every connect, test and disconnect is recorded in the audit trail.

### Workspace and account
- Demo workspace with sample data and no sign-up.
- Editable business profile, side or top navigation preference.
- Shareable, history-aware tabs (`#calendar`, `#reports`, …): browser Back/Forward and the in-app Back shortcut return to the previous page, and the mobile tab strip keeps the current page in view with visible scroll controls.
- Password change that signs out all other sessions.
- Download all workspace data or permanently delete the workspace and account.
- POPIA-aware privacy notes and honest product limitations.

## Run locally

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
npm run db:local     # terminal 1 — embedded PostgreSQL, applies migrations
npm run dev          # terminal 2 — http://localhost:3000
```

The embedded database stores data in `.local-db/`. Keep the database process running while using the app. `npm run db:migrate` is for a regular PostgreSQL server; the embedded development server applies migrations at startup. `docker-compose.yml` is available if you prefer PostgreSQL 17.

If the embedded database is killed abruptly it can refuse to reopen. Stop `npm run db:local`, then run `npm run db:reset` to move the old directory aside, start `npm run db:local` again and finish with `npm run db:seed`. Nothing is lost that the seed script cannot rebuild.

Copy `.env.example` to `.env` if needed. For another host or port, set `APP_ORIGIN` to the exact browser origin.

## Demo data and test accounts

Seed a realistic six-month workspace (customers, transactions, quotes, invoices, a bank import, a week of tasks and a team) at any time:

```bash
npm run db:seed
```

The script is repeatable: it removes previous `@pocketcfo.demo` workspaces and rebuilds them. Sign in with:

| Role | Email | Password |
| --- | --- | --- |
| Owner | `owner@pocketcfo.demo` | `PocketCfoDemo2026!` |
| Admin | `admin@pocketcfo.demo` | `PocketCfoAdmin2026!` |
| Member | `staff@pocketcfo.demo` | `PocketCfoStaff2026!` |

These accounts exist only in the local development database. Change the passwords or delete the workspace before sharing a deployed environment.

Two ready-to-import bank statements live in `samples/`:

- `samples/capitec-october-2026.csv` — single signed amount column, including a duplicate row.
- `samples/bank-debit-credit-example.csv` — separate debit and credit columns.

The demo workspace already contains two rows from `capitec-october-2026.csv`, so importing that file shows the safety net in action: the two matching rows are marked **Already imported**, the repeated row inside the file is flagged, and only the new rows are added. Import it twice to see that nothing is ever double-counted.

## Team access

The workspace owner can open **Settings → Team access** and add a person with their own name, email, temporary password and role:

- **Admin** — manages records and documents.
- **Member** — records day-to-day work.
- **Owner** — everything, including integrations, team access and workspace deletion.

Only the owner can manage integrations or team access. A workspace cannot be deleted while it still has team members, so it is never left without an owner. Removing a person deletes their sign-in if they have no other workspace; their past entries remain in the records.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string. |
| `APP_ORIGIN` | Recommended | Exact browser origin used for same-origin write checks. |
| `GENURA_LOCAL_DB` | Local only | Limits the Prisma pool to one connection for the embedded server. |
| `INTEGRATION_ENCRYPTION_KEY` | Yes for integrations | Secret used to derive the AES-256-GCM key. Use at least 24 random characters; 32+ bytes is better. |

Generate a key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

In production, store this in a secret manager. Rotating it makes previously saved integration credentials unreadable, so plan rotation carefully.

## Security model

Implemented in this codebase:

- **Passwords:** scrypt with a random salt; constant-time digest comparison.
- **Sessions:** 256-bit random tokens, stored only as SHA-256 hashes. Cookies are `HttpOnly`, `SameSite=Strict`, `Secure` in production, and expire after 8 hours. Expired sessions are cleaned up.
- **CSRF/origin checks:** authenticated writes require an allowed `Origin`.
- **Rate limiting:** login, demo, password, account deletion, bank imports and task writes are throttled.
- **Validation:** Zod schemas on all user input; Prisma parameterises database queries.
- **Tenant isolation:** every business record is scoped by the signed-in user's `businessId`.
- **Headers:** CSP, HSTS in production, `X-Content-Type-Options`, `X-Frame-Options: DENY`, referrer policy, permissions policy and no-store API caching.
- **Secrets:** integration credentials encrypted with AES-256-GCM; masked in the UI and excluded from backups.
- **Webhook safety:** HTTPS only; local, internal and private-network targets are rejected to reduce SSRF risk. Deliveries have an 8-second timeout.
- **CSV safety:** 2 MB / 2,000-row limits, formula-injection protection on exports, and SHA-256 deduplication.
- **Failure handling:** generic server errors are returned to clients; details go to server logs.
- **Audit trail:** financial and account changes are recorded.

### No system is 100% secure

This application is hardened for a competition demonstration and small production deployments, but security is a process, not a guarantee. Before handling real customer money or sensitive data at scale:

1. Serve only over HTTPS and deploy behind a trusted reverse proxy/WAF.
2. Move rate limiting to a shared store such as Redis; the current limiter is per-process memory.
3. Use a managed secret manager and rotate `INTEGRATION_ENCRYPTION_KEY` with a migration plan.
4. Add email verification, password reset, MFA and session/device management.
5. Add automated backups, restore drills, log retention and alerting.
6. Run dependency scanning, penetration testing and an independent security review.
7. Review POPIA/GDPR obligations, data residency and a formal retention policy with a qualified adviser.
8. Complete real PayFast gateway verification and payment-webhook reconciliation before advertising online payments.

## API overview

Same-origin JSON endpoints under `/api`:

- Auth: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/demo`, `POST /api/auth/password`, `GET /api/auth/me`
- Workspace: `GET /api/dashboard`, `PATCH /api/business`, `GET /api/export`, `DELETE /api/account`
- Transactions: `GET/POST /api/transactions`, `PATCH/DELETE /api/transactions/:id`
- Customers: `GET/POST /api/customers`, `PATCH/DELETE /api/customers/:id`
- Documents: `GET/POST /api/deals`, `PATCH/DELETE /api/deals/:id`
- Tasks: `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id` (`GET` accepts `from`/`to` ISO bounds, up to 400 days)
- Budget and audit: `GET/PUT /api/budget`, `GET /api/audit`
- Integrations: `GET /api/integrations`, `PUT/DELETE /api/integrations/:provider`, `POST /api/integrations/:provider/test`
- Bank import: `POST /api/integrations/bank-csv/preview`, `POST /api/integrations/bank-csv/import`

API errors return `{ "error": "..." }` with an appropriate HTTP status.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Product boundary

POCKET CFO is record-keeping and planning software. It is not a bank, lender, credit provider, accountant or tax service. Readiness scores and reports are estimates from the records entered by the business owner and are not financial advice or credit decisions.
