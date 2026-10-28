# Project charter

Status of the product: not started. This charter records the assignment and the decisions accepted on 15 Oct 2026.

## Problem

Darb clients must attach a receipt or a tax invoice to every card transaction so VAT filings have evidence. Today a person opens each WhatsApp photo and each forwarded invoice and searches for the matching card charge. The match is often obvious and sometimes genuinely ambiguous: two fills at the same chain on the same day, a restaurant tip, a scan that failed, or a second photo of a receipt that was already attached.

## Outcome

A single Next.js application that:

1. Accepts documents from email and WhatsApp webhooks.
2. Extracts fields through a replaceable interface. The default implementation is a fixture mock.
3. Scores candidate transactions with an explainable confidence.
4. Auto-attaches one clear match.
5. Keeps ambiguous and risky matches for a person, without attaching a second document to a transaction that already has one.

## Goals

- Meet every Must requirement in [requirements/REQUIREMENTS.md](requirements/REQUIREMENTS.md).
- Keep the matcher free of I/O so the grading-heavy logic can be tested with plain objects.
- Make a wrong auto-attach harder than an extra review.
- Leave a README and an `IMPLEMENTATION.md` that a reviewer can follow without this chat.

## Non-goals

- A real email inbox, a real WhatsApp Business account, or a production OCR vendor in the first build.
- Authentication and reviewer identity. See assumption ASM-006.
- Multi-transaction invoices as working software. A design sketch is enough (BON-003).
- Microservices, a separate queue, or Postgres.
- Copying source from another take-home checkout.

HMAC (BON-005) stays deferred. The live extractor (BON-004) was added after the review page. Photos use Apple Vision, and it stays off unless `EXTRACTOR=tesseract` ([ADR 0009](decisions/0009-tesseract-extractor.md)).

## Consumers

| Who | What they do | In the first build |
| --- | --- | --- |
| Email inbound-parse provider | `POST /api/webhooks/email` | Planned |
| WhatsApp Cloud API, simplified | `POST /api/webhooks/whatsapp` | Planned |
| Card-transaction feed | `POST /api/transactions`, so a late invoice can match | Planned bonus |
| Ops reviewer | Confirms or rejects candidates | Planned bonus, after matching and idempotency |
| Grader | Reads the repo, runs tests, reads `IMPLEMENTATION.md` | The success audience |

There is no end-driver UI. Drivers and suppliers stay outside the system and show up only as sender identifiers.

## Scope

In scope: the webhook pipeline, the mock extractor, the matcher, persistence, the database rule of one confirmed document per transaction, tests for the required edges, and the two assignment write-ups.

`/review`, rematch-on-new-transaction, and an optional Tesseract extractor are built. HMAC is still out of scope.

If time runs short, the assignment says to cut the review page and the bonuses, not the matcher edges or webhook idempotency (NFR-007).

## Success criteria

- The six required fixtures behave as [FR-022](requirements/REQUIREMENTS.md) through [FR-027](requirements/REQUIREMENTS.md) describe.
- A redelivered webhook does not create a second document.
- An extractor failure does not produce an HTTP 500.
- Confirming a match twice does not create two confirmed rows, and the database rejects a second confirmed document for the same transaction.
- `IMPLEMENTATION.md` states the weights, the thresholds, and why a borderline case goes to a person.
- A new developer can set up, seed, send the sample webhooks, and run the tests from the README. Those steps are not possible yet.

## Constraints

The assignment names the stack: TypeScript 5 in strict mode, Next.js 15 App Router, Prisma 6 with SQLite, next-safe-action 8, Zod 3, Jest 29. Amounts are integer halalas. The project root is `brijesh/`. Primary keys are integers.

Details and IDs: [requirements/REQUIREMENTS.md](requirements/REQUIREMENTS.md). Accepted records: [decisions/0001-integer-primary-keys.md](decisions/0001-integer-primary-keys.md), [decisions/0002-defer-hmac-and-live-extractor.md](decisions/0002-defer-hmac-and-live-extractor.md).

## Terminology

| Term | Meaning |
| --- | --- |
| Document | One received file: an email attachment or a WhatsApp image. |
| Transaction | One card charge, in halalas. |
| Candidate | A transaction the matcher considers for a document. |
| Signal | One scored fact: amount, date, merchant, or card last 4. |
| Confidence | A number from 0 to 1 after the signals are combined. The brief also calls this the match score. |
| Auto-match | The system attaches the document. Match status `AUTO_CONFIRMED`. Document status `MATCHED`. |
| Review | A person must choose. Document status `NEEDS_REVIEW`. Match status `CANDIDATE`. |
| Sender scope | The only transactions a document may see. WhatsApp: that driver's phone. Email: that client's transactions. |
| Halala | The minor unit of SAR. 187.50 SAR is stored as `18750`. |
| Fixture | A file whose bytes the mock extractor recognizes by hash. |

Document statuses: `RECEIVED`, `EXTRACTED`, `MATCHED`, `NEEDS_REVIEW`, `UNMATCHED`, `FAILED`.

Match statuses: `CANDIDATE`, `AUTO_CONFIRMED`, `CONFIRMED`, `REJECTED`.

## Current facts versus the plan

| Fact today | Plan |
| --- | --- |
| `brijesh/` contains this documentation | The Next.js app is in this directory |
| No `package.json`, no Prisma schema, no tests | Phases in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) |
| Reference apps exist outside this directory and are read-only | Behavior we keep is rewritten here |
