# LendLoop

**Borrow what you need. Lend what you don’t.**

LendLoop is a neighborhood tool-lending board built for the Fluence full-stack take-home. Guests see tool names and categories. Signed-in neighbors can lend tools, request dates, and track loans. n8n coordinates request notifications and overdue reminders, visible in each recipient’s Activity view.

## Run locally

### This checkout: local Convex + Docker n8n

The local environment uses Convex at `http://127.0.0.1:3210` (HTTP actions on
port `3211`) and n8n at `http://localhost:5678`. No Convex login or tunnel is
needed. The ignored `.env.local` and `n8n/.env` files contain the local settings.
The n8n callback URL uses `http://host.docker.internal:3211` so the container can
reach Convex on the host. Convex's `N8N_REQUEST_WEBHOOK_URL` uses
`http://127.0.0.1:5678/webhook/lendloop-request-event`.

The three n8n workflows are imported and published. The local editor owner
credentials are in the ignored `.env.n8n-owner.local` file. Use them to sign in
at [the n8n editor](http://localhost:5678). Convex is configured with both
automation secrets and the request webhook URL; its first function deployment
will complete after the Clerk issuer is set below.

To finish Clerk:

1. Create a development application in the [Clerk dashboard](https://dashboard.clerk.com).
   In **JWT templates**, create a template from the **Convex** preset. Keep its
   name and `aud` claim as `convex`, and save it.
2. In `.env.local`, fill in `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_test_…`)
   and `CLERK_SECRET_KEY` (`sk_test_…`) from that application's API keys page.
   Keep the existing Convex values.
3. Start Convex in one terminal (the version below is already cached locally):

   ```sh
   npx convex dev --local-backend-version precompiled-2026-11-16-80befbc
   ```

4. In another terminal, set the issuer to the **Issuer** URL from the Clerk
   template (also shown as the Clerk Frontend API URL):

   ```sh
   npx convex env set CLERK_JWT_ISSUER_DOMAIN 'https://YOUR-INSTANCE.clerk.accounts.dev'
   ```

   The running Convex watcher will retry the function deployment automatically.
   `convex/auth.config.ts` already reads this variable; no source edit is needed.

5. Start or restart Next.js after saving the keys:

   ```sh
   npm run dev
   ```

On subsequent starts, run `docker compose up -d`, the Convex command above,
and `npm run dev`. Open [LendLoop](http://localhost:3000).

### Alternative: hosted Convex

Use Node.js 22.18+, 24.11+, or 26+ (see `engines.node`), npm 11.17, Docker Compose, a Clerk development application, and a Convex development deployment. Next.js and n8n run locally. Hosted Convex needs an HTTPS route to the n8n webhook. Use a tunnel or an HTTPS reverse proxy that forwards **only** `POST /webhook/lendloop-request-event` to local n8n. Keep the n8n editor on localhost.

### 1. Set up Clerk and Convex

```sh
npm ci
cp .env.example .env.local
npx convex dev
```

Keep Convex running while configuring the project. If the first push reports a missing environment variable, set it as described below and let Convex retry. For Clerk, create a JWT template using the **Convex** preset. Keep the template name and audience as `convex`. Copy the issuer URL from the template into the Convex deployment environment and put the Clerk publishable and secret keys into `.env.local`. The Convex CLI normally writes `NEXT_PUBLIC_CONVEX_URL` there.

| Where                | Variable                            | Value                                                                         |
| -------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| Next.js `.env.local` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk development publishable key                                             |
| Next.js `.env.local` | `CLERK_SECRET_KEY`                  | Clerk development secret key                                                  |
| Next.js `.env.local` | `NEXT_PUBLIC_CONVEX_URL`            | Convex client URL ending in `.convex.cloud`                                   |
| Convex deployment    | `CLERK_JWT_ISSUER_DOMAIN`           | Clerk JWT template issuer URL                                                 |
| Convex deployment    | `N8N_REQUEST_WEBHOOK_URL`           | Full HTTPS production webhook URL ending in `/webhook/lendloop-request-event` |
| Convex and n8n       | `CONVEX_TO_N8N_SECRET`              | Secret for request events                                                     |
| Convex and n8n       | `N8N_TO_CONVEX_SECRET`              | A different secret for lookups and write-backs                                |
| n8n `n8n/.env`       | `CONVEX_SITE_URL`                   | Convex HTTP actions URL ending in `.convex.site`                              |
| n8n `n8n/.env`       | `N8N_ENCRYPTION_KEY`                | Independent n8n credential encryption key                                     |
| n8n `n8n/.env`       | `WEBHOOK_URL`                       | Base HTTPS URL of the webhook ingress, ending with `/`                        |

Use `openssl rand -hex 32` once for each of the three secrets. Set the Convex values in the deployment dashboard and copy the two corresponding signing keys into the ignored `n8n/.env` file.

### 2. Import and publish the workflows

```sh
cp n8n/.env.example n8n/.env
# Fill in n8n/.env, then start the service.
docker compose up -d
```

1. Open [the local n8n editor](http://localhost:5678) and create the local owner account.
2. Run `docker compose exec n8n n8n import:workflow --separate --input=/workflows`. Refresh the editor. The export contains three workflows.
3. In both the request and overdue workflow settings, confirm the **Error workflow** points to **LendLoop · Automation errors**. Publish the error workflow first, then publish the request and overdue workflows. If you import through the editor instead of the CLI, reselect the error workflow because n8n may assign a new ID.
4. Set the Convex webhook environment variable to the production URL shown in the Request webhook node, using the reachable HTTPS ingress hostname. The n8n `webhook-test` URL only works during a test listener session.
5. Run `npm run dev` and open [LendLoop](http://localhost:3000).

The Compose profile runs a dedicated single-owner n8n with an internal task runner. HMAC Code nodes read deployment environment variables via `$env`. Keep workflow editing limited to that trusted owner. The mock notification needs no SMTP or chat credentials.

### 3. Walk through the demo

1. Sign in as a lender and list a tool. In another browser profile, confirm the guest board displays its name and category only.
2. Sign in as a borrower in that profile and request today through tomorrow. The lender should see a notification under **Activity** and the request under **Incoming requests**.
3. Approve the request. Check the borrower’s activity and both loan views. Mark it returned as the lender and check that the board shows availability again.
4. To check admin access, sign in once as a separate account. From the Convex developer CLI, promote its Clerk user ID with the internal-only function below. Check **All loans**, moderation, and the Trusted Lender badge. To revoke access, rerun the command with `"role":"user"`.

   ```sh
   npx convex run members:setRole '{"subject":"user_REPLACE_WITH_CLERK_ID","role":"admin"}'
   ```

5. For an overdue check, use an approved, unreturned loan with a return day before today in UTC. In a disposable dev deployment, you can move an approved loan’s dates to the previous day in the Convex dashboard. Run **Daily overdue reminders** manually and check the borrower’s Activity and the loan’s reminder date. Run it again to confirm only one reminder is recorded for the day.

## Architecture

| Component                    | Responsibility                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Next.js App Router and Clerk | Public catalog and sign-in, member views, category filter, listing and loan forms                            |
| Convex queries and mutations | Identity, role and ownership checks, lifecycle and date validation, booking conflicts, notifications         |
| Convex scheduler and outbox  | Atomically queue status changes with loan writes, dispatch signed events, retry and record terminal failures |
| n8n request workflow         | Verify the event signature, call the signed mock delivery endpoint, then acknowledge Convex                  |
| n8n daily workflow           | At 09:00 UTC, page through approved overdue loans and log each eligible borrower’s reminder                  |
| n8n error workflow           | Capture failed workflow and execution IDs for triage                                                         |

Loan dates are inclusive UTC calendar days. A lender can approve or decline pending requests and mark active loans returned once the loan starts. Borrowers can cancel their own pending requests. Booking approval checks overlaps in the same Convex transaction that changes the state. Removing a listing archives it and cancels pending requests. Approved loans can still be returned and loan history remains available.

### Security, data minimization, and reliability

- **Enforcement.** Convex verifies Clerk’s JWT and maps it to a server-owned member record. New accounts always start as users. Admins may moderate any listing, read all loans, and award a badge. Loan transitions still require lender or borrower participation. Direct Convex calls receive the same checks as the UI.
- **Data boundaries.** Guests receive only available tool names and categories. Convex keeps the mapping between internal recipients and Clerk identities. The n8n request webhook receives an opaque event ID. The overdue workflow receives opaque loan IDs, the UTC day, and a pagination cursor. Neither workflow needs a name, email address, tool description, or Clerk user ID.
- **Signed transport.** Both directions authenticate the route scope, millisecond timestamp, and exact payload bytes using HMAC-SHA-256 and separate secrets. The request webhook signs the inner JSON string so the signature survives n8n’s outer JSON parsing. n8n signs the raw callback body and the Convex HTTP action verifies it. Receivers reject invalid signatures and timestamps outside five minutes. Write endpoints also resolve IDs and check eligibility server-side.
- **Idempotent delivery.** A request event ID or loan ID plus UTC day keys the mock notification. Convex writes each notification and its delivery status in one transaction. A repeated callback logs no second notification. Reminder writes recheck the date and status, so a loan returned after the read is skipped. Successful scheduler acknowledgement requires a recorded delivery.
- **Failures.** Convex attempts request delivery four times with 10-second, 1-minute, and 5-minute backoffs. n8n retries callback HTTP requests three times in total, retains failed executions, and records scheduled and webhook failures via its error workflow. The loan UI shows a terminal request-notification failure. After correcting configuration, an operator can rerun the internal `dispatch:send` action with `{"eventId":"…","attempt":1}` for a failed event from the Convex dashboard or CLI. Rerunning an overdue execution safely catches up on the current UTC day.

### What I would change for production

Move automation signing keys to a managed secret store and into a dedicated signing node or worker with rotation support and tighter editor permissions. Encrypt and restrict execution data, set explicit retention, alert on dead letters or missed reminder runs, and give operators audited replay controls. Replace the mock inbox with a notification provider that accepts a stable idempotency key or supports reconciliation after ambiguous delivery. Add tenant-scoped authorization and audit trails, rate limits, paginated board and loan queries, and load tests for simultaneous approvals. For a healthcare deployment, review access, retention, vendor agreements, and data flow against the applicable requirements before moving any patient data through an integration.

## Vite+ toolchain and checks

This project pins Vite+ 1.7.0 and npm 11.17.0. Use a supported Node.js
runtime (`^22.18.0 || ^24.11.0 || >=26.0.0`) and install with `npm ci`.
`package-lock.json` is the npm installation lockfile; `packageManager` also
selects npm for Vite+ package-management commands. No global `vp` installation
is required.

```sh
npm run check       # Vite+ lint/types, original Next.js ESLint checks, and tsc
npm test            # All integration tests through Vite+'s bundled Vitest
npm run build       # Next.js production build
npm run dev         # Next.js development server on localhost:3000
```

To use the local CLI directly:

```sh
npm exec -- vp check
npm exec -- vp test run
npm exec -- vp run build
npm exec -- vp run dev
npm exec -- vp run check
```

`vp run <task>` runs the matching project script. The built-in `vp dev` and
`vp build` invoke Vite, so this Next.js app uses `vp run dev` and `vp run build`.
A direct `vp build` fails with a missing `index.html`; Next.js App Router and
Clerk still require the existing Next.js server and build pipeline.
`vp test` invokes Vitest directly; add `run` for a single non-watching run.

Test and Oxlint settings live in `vite.config.ts`. The edge-runtime test
environment is preserved. ESLint remains enabled because the converter cannot
fully reproduce the Next.js parser/resolver settings and several rules,
including `@next/next/no-location-assign-relative-destination` and the React
Compiler config/gating rules. `npm run check` includes both linters and the
original TypeScript compiler. Oxlint currently reports nine non-blocking
warnings in existing code (status markup, FormData string conversion, and the
workflow test's deliberate Function constructor).

Formatting is opt-in (`check.fmt: false`) to preserve the existing source
layout. Use `npm run format -- <paths>` to format selected files, or
`npm exec -- vp fmt --check <paths>` to check them. Generated Convex files,
Next.js declarations, and agent skill directories are excluded.

The migration generated `test.clearMocks: false` in both configs; after
consolidating them into `vite.config.ts`, it was removed and all six tests
passed unchanged with Vitest 5's default `clearMocks: true`. No compatibility
settings remain. There are no configured browser, coverage, benchmark, or
library packaging suites.

The integration tests use Convex’s in-memory runtime and execute the checked-in n8n Code node source against real Convex HTTP handlers in that runtime. They cover public fields, RBAC, overlapping approvals, signature verification and replay, retries, pagination, and returns that race reminder delivery. The manual walkthrough exercises Clerk JWT exchange with your configured Clerk instance.

Setup references: [Convex and Clerk](https://docs.convex.dev/auth/clerk), [n8n workflow CLI](https://docs.n8n.io/hosting/cli-commands/), [n8n task runners](https://docs.n8n.io/hosting/configuration/task-runners/).
