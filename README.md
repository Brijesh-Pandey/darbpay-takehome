# Darb receipt and invoice matching

Drivers send receipt photos on WhatsApp. Suppliers email tax invoices. This project accepts those documents, reads them with a mocked extractor, and attaches each one to a card transaction when the match is clear. Ambiguous matches wait for a person.

The assignment is the source of truth: [exercise gist](https://gist.github.com/mchbeib/5901995f44d3d7d1359510bc0dd2fa4d).

## Status

Phase 8 is in the repository: the matcher, the mock extractor, both webhooks, confirm and reject, late-charge rematch, and `/review`. A live photo reader is available when `EXTRACTOR=tesseract` (ADR 0009). It uses Apple Vision. `/upload` stores a photo as email from the seeded Alfanar mailbox and shows the read (ASM-010). The mock stays the default. HMAC is still later.

| Decision | State |
| --- | --- |
| This directory is the Next.js project root | Accepted |
| Integer primary keys | Accepted |
| HMAC waits until after the review page. The live extractor reads photos with Apple Vision and is off by default | Accepted. [ADR 0002](docs/decisions/0002-defer-hmac-and-live-extractor.md), [ADR 0009](docs/decisions/0009-tesseract-extractor.md) |
| Scoring, idempotency keys, file storage, and email-sender tables | Accepted. [ADR 0003](docs/decisions/0003-idempotency-keys.md) through [ADR 0007](docs/decisions/0007-email-sender-scope.md) |

## Documentation

| Document | What it answers |
| --- | --- |
| [docs/PROJECT.md](docs/PROJECT.md) | Why the project exists, and what it will not do |
| [docs/requirements/REQUIREMENTS.md](docs/requirements/REQUIREMENTS.md) | Every requirement, with an ID |
| [docs/requirements/USER_FLOWS.md](docs/requirements/USER_FLOWS.md) | What happens on each webhook and review action |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the planned pieces fit together |
| [docs/TECHNICAL_DESIGN.md](docs/TECHNICAL_DESIGN.md) | Modules, schema, and contracts. Open items are listed at the end. |
| [docs/TEST_STRATEGY.md](docs/TEST_STRATEGY.md) | What will be tested, and how |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | The build order |
| [docs/REQUIREMENT_TRACEABILITY.md](docs/REQUIREMENT_TRACEABILITY.md) | Where each ID is specified, built, and checked |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | How to change the project once code exists |
| [docs/decisions/](docs/decisions/0001-integer-primary-keys.md) | Accepted design records, ADR 0001 through ADR 0009 |
| [docs/PHASE_1_REVIEW.md](docs/PHASE_1_REVIEW.md) | Review of the schema, seed, and tests before phase 2 |
| [AGENTS.md](AGENTS.md) | Rules an agent must follow before editing |

## What a deployed host runs

The mock extractor is the default. Sample webhooks and `npm test` never call a photo reader and never need a key.

`EXTRACTOR=tesseract` turns on the live reader. Photos are read by Apple Vision, compiled on that machine with `swiftc` the first time a photo arrives. That path works on macOS. A Linux container cannot compile or run it, so a photo fails closed as `UNREADABLE`. A digital PDF is read from its text layer with `unpdf` and does not need macOS.

Currency conversion lives in `lib/money`. The pegs are in source. The matcher does not read the operating system's locale and does not call a live FX feed, so the same conversion runs on every host. A different currency is scored and left for a person. It is not auto-attached.

Root [IMPLEMENTATION.md](IMPLEMENTATION.md) is the scoring guide and the email curl. It is not a substitute for the design docs.

## Prerequisites

Verified in this directory on 15 Oct 2026:

- Node.js v22.18.0 and npm 10.9.3
- Next.js 15.5.28, React 19.1.0, TypeScript 5.9.3
- Prisma 6.19.3 with SQLite
- Zod 3.25.76, next-safe-action 8.7.3, Jest 29.7.0

`ts-node` 10 is installed so Jest can load the assignment's `jest.config.ts`. It is not an application dependency.

## Setup

`DATABASE_URL` is `file:./dev.db`. Prisma resolves that path from `prisma/schema.prisma`, so the file is `prisma/dev.db`. Copy `.env.example` to `.env` if `.env` is missing.

These commands were run from `brijesh/` on 15 Oct 2026. `npm run dev` was not part of that run.

```bash
npm install
npx prisma migrate deploy
npx prisma db seed
npm test
npx tsc --noEmit
npm run lint
```

`npx prisma` must be run inside this directory so it uses Prisma 6. A seed prints `{"clients":2,"emailSenders":2,"transactions":15}` when the database has only the reference rows. Running it again does not remove documents. On 15 Oct 2026, `npm test` passed 16 suites and 153 tests. `tsc` and `eslint` exited 0.

On 27 Oct 2026, `npm test` passed 20 suites and 184 tests. `npx tsc --noEmit` and `npm run lint` exited 0. A separate manual Vision read of the two station photos returned the amount, date, VAT number, and invoice number. That call is not part of `npm test`. Leave `EXTRACTOR` unset for the sample webhooks. Set `EXTRACTOR=tesseract` and restart the server to read a real photo. The first photo compiles the macOS reader.

`/upload` stores a PNG, JPEG, WEBP, or PDF as email from the seeded Alfanar mailbox (ASM-010). With `EXTRACTOR=tesseract`, the page shows the text read from the bill. The recorded pass of the four real files is `fixtures/demo/real-bills/extraction-demo.mp4`.

The email sample is `fixtures/webhooks/email-exact.json`. Start the app, then post it:

```bash
npm run dev
curl -s -X POST http://localhost:3000/api/webhooks/email \
  -H 'content-type: application/json' \
  --data-binary @fixtures/webhooks/email-exact.json
```

`npm run dev` and that curl were run in phase 4. The stored outcome is in [IMPLEMENTATION.md](IMPLEMENTATION.md). A second post of the same file returns `duplicate` and does not add a row.

The WhatsApp sample is `fixtures/webhooks/whatsapp-exact.json`:

```bash
curl -s -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H 'content-type: application/json' \
  --data-binary @fixtures/webhooks/whatsapp-exact.json
```

`npm run dev` and that curl were run in phase 5. The stored outcome is in [IMPLEMENTATION.md](IMPLEMENTATION.md). A second post returns `duplicate`.

Two more WhatsApp samples land on Needs review, because the bytes are fixtures the matcher cannot attach on its own. `fixtures/webhooks/whatsapp-albaik.json` is the two-branch Albaik receipt. `fixtures/webhooks/whatsapp-tip.json` is the Chef's Table receipt that is above the charge by a tip. Post each once:

```bash
curl -s -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H 'content-type: application/json' \
  --data-binary @fixtures/webhooks/whatsapp-albaik.json

curl -s -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H 'content-type: application/json' \
  --data-binary @fixtures/webhooks/whatsapp-tip.json
```

Refresh `/review` after the response. A second post of the same file returns `duplicate`.

Open the review desk with `npm run dev`, then visit [http://localhost:3000/review](http://localhost:3000/review). Needs review lists documents in `NEEDS_REVIEW`. Unmatched lists documents in `UNMATCHED` and does not offer confirm or reject. Confirm and reject call the existing server actions with `{ matchId }` only.

On 15 Oct 2026 the page was exercised on port 3010 against `.test-db/review-ui.db`, not `prisma/dev.db`. The queue showed three documents. Confirm on the first Albaik candidate (transaction 2) attached that receipt, disabled the other buttons while the request was in flight, and removed the document from the queue. The second document still offered transaction 2, with confirm hidden and the text "This transaction already has a confirmed document." Reject on that candidate left the document unmatched. Reject on the Chef's Table candidate (transaction 4) left the queue empty. Refresh kept the empty state. A reload showed the loading line, then the empty queue. The development database still has the phase 4 email document (`MATCHED` / `AUTO`). The phase 5 WhatsApp document is now `UNMATCHED` / `ALL_CANDIDATES_REJECTED` and appears on the Unmatched tab.
