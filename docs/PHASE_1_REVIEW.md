# Phase 1 review

Reviewed 15 Oct 2026 against the assignment gist, ADR 0001 through ADR 0007, and the files in this directory. No application code was changed. The matcher, webhooks, extractor, and review UI were not started. The reference checkouts were not modified.

## Decision

**Go for phase 2.** Phase 2 is the pure matcher and root `IMPLEMENTATION.md`. It does not open the database. Nothing in the schema, seed, or current tests blocks that work.

**Do not add a route that imports `lib/prisma.ts` until the SQLite URL is made absolute.** That is the first database-using phase (phase 4), not phase 2.

## Critical blockers

None for phase 2.

## 1. Assignment compliance

Prisma and `@prisma/client` are 6.19.3 (`package-lock.json`). The applied migration is `prisma/migrations/20261015113000_init/migration.sql`. A diff from that migration to `prisma/schema.prisma`, and a diff from the live file `prisma/dev.db` to the same schema, both produced an empty migration on Prisma 6.19.3. The hand-written partial indexes are therefore not treated as drift by this version.

### Models and enums

| Assignment | In the migration | Verdict |
| --- | --- | --- |
| `Transaction`, `Document`, `DocumentMatch` | All three, integer primary keys | Matches ADR 0001 |
| `DocumentSource`, `DocumentStatus`, `MatchStatus` | Same members, stored as `TEXT` | Matches FR-013. SQLite has no enum type, so a raw insert can store any string. The Prisma client is what restricts the values. |
| `DocumentMatch` unique `(documentId, transactionId)` | `DocumentMatch_documentId_transactionId_key` | Present |
| `externalId` unique | `Document_externalId_key` | Present |
| `contentHash` globally unique | Unique with `scope` instead | Accepted deviation DEV-001 / ADR 0003 |
| `clientId` with no client table | `Client` and `ClientEmailSender`, integer ids, email unique | Accepted deviation DEV-004 / ADR 0007 |
| Extraction columns on `Document` | Present, nullable until extracted | Present, including `rawText`, `decidedBy`, and `decidedAt` |

Columns beyond the sample, all from the accepted design: `scope`, `statusReason`, `filename`, `mimeType`, `content` (`BLOB NOT NULL`), `invoiceNumber`, `extractionConfidence`, `processingStartedAt`.

Amounts are `INTEGER`. `Transaction.currency` defaults to `SAR`. `driverPhone` is nullable. Foreign keys are `ON DELETE RESTRICT ON UPDATE CASCADE` from `ClientEmailSender` and `Transaction` to `Client`, and from `DocumentMatch` to both `Document` and `Transaction`. The Prisma client connects with `PRAGMA foreign_keys = 1` (measured on `prisma/dev.db`).

There is no database check that an email is lower-cased or that a VAT number is 15 digits. Those rules are for the webhook and extractor phases.

### Partial unique indexes

The schema cannot express them. They exist only at the bottom of the migration:

```sql
CREATE UNIQUE INDEX "DocumentMatch_one_confirmed_per_transaction"
  ON "DocumentMatch"("transactionId") WHERE "status" IN ('CONFIRMED', 'AUTO_CONFIRMED');
CREATE UNIQUE INDEX "DocumentMatch_one_confirmed_per_document"
  ON "DocumentMatch"("documentId") WHERE "status" IN ('CONFIRMED', 'AUTO_CONFIRMED');
```

Expected behavior, which the tests exercise rather than only reading the name:

- Two `CANDIDATE` rows for one transaction are allowed. The pair unique index still requires different documents.
- A second `CONFIRMED` or `AUTO_CONFIRMED` row for that transaction fails with Prisma `P2002`.
- A second confirmed row for the same document, even against another transaction, fails the same way.
- `REJECTED` is outside the `WHERE` clause, so it does not occupy the slot. That case is not tested.
- The ordinary `(documentId, transactionId)` unique index would not have rejected the two-document test. The failure is evidence of the partial index.

`prisma migrate diff` on 6.19.3 did not emit `DROP INDEX` for these indexes. That can change in a later Prisma version. `migrate dev` should not be used to regenerate `20261015113000_init`.

### Seed

`prisma/seed.ts` only upserts clients by id, mailboxes by email, and transactions 1 through 15 by id. It has no `delete` and it never writes `Document` or `DocumentMatch`. Re-seeding updates the reference rows in place.

Measured on `prisma/dev.db` after two seeds: 2 clients, 2 mailboxes, 15 transactions, 0 documents. Mailboxes are `billing@alfanar-fuel.com.sa` on client 1 and `billing@redsea-haulage.example` on client 2. Transaction 1 is `+966551234567`, 12500 halalas. Transactions 2 and 3 are the same-day Albaik pair. Transaction 5 is client 2's twin of transaction 1. Transaction 4 is 6325 halalas.

`sqlite_sequence` is Client 2, Transaction 15, ClientEmailSender 4, while the mailbox ids are 1 and 2. The next insert will not collide. ADR 0001 already treats autoincrement gaps as normal.

The returned counts are table totals, not "rows this call inserted". A database that already has an extra transaction will print more than 15. The function still will not delete that row. The current test does not insert such a row.

## 2. SQLite path

`DATABASE_URL` is `file:./dev.db` in `.env` and `.env.example`.

Prisma Client 6.19.3 does not resolve that relative path from `process.cwd()`. The generated client (`node_modules/.prisma/client/index.js`) stores `"relativePath": "../../../prisma"`. The runtime then does `path.resolve(dirname, relativePath)` and, if that directory does not exist, falls back to `dirname` (`@prisma/client/runtime/library.js`).

Today `dirname` is `node_modules/.prisma/client`, so the resolved directory is `prisma/`, which exists. Measured with `PRAGMA database_list` through `new PrismaClient()`:

`prisma/dev.db`

`migrate deploy` created that same file. Schema-bound CLI commands and the unbundled client agree.

Two different resolutions were also measured:

- `prisma migrate diff --from-url "file:./dev.db"` returned P1003, `Database dev.db does not exist`. That flag resolves from the process directory. There is no `brijesh/dev.db`. The same command with an absolute `file:` URL for `prisma/dev.db` succeeded.
- The home page does not import Prisma, so the current `.next/server` output does not contain a bundled client. The bundling failure is not reproduced in this app yet. The mechanism is already in this version: once a route imports `lib/prisma.ts`, the bundled `dirname` is a folder under `.next/`. `../../../prisma` from that folder often does not exist, the fallback `dirname` is used, and `file:./dev.db` opens a different file or fails with "unable to open the database file". Tests pass because they pass an absolute `datasourceUrl` and never load the bundled client.

### Fix before the first route

Keep the CLI URL as `file:./dev.db` so `migrate` and `db seed` continue to use `prisma/dev.db`. In `lib/prisma.ts`, if the URL is a relative `file:` path, resolve it against `path.resolve(process.cwd(), "prisma")` and pass the absolute URL as `datasourceUrl`. An absolute path does not depend on the bundled `dirname`.

Do not put a machine-specific absolute path in `.env.example`. Commands still run from `brijesh/`.

This changes the assignment's boilerplate. It is the small exception worth making before phase 4. Approval is required before that edit.

Tests already use an absolute `file:` URL, so they keep targeting `.test-db/reference-data.db`. This review re-ran `npm test` (6 passed) and `prisma/dev.db` stayed at its 11:35 timestamp. `afterAll` removed the test file.

## 3. Test reliability

The suite is repeatable when started with `npm test`. `beforeAll` deletes `.test-db/reference-data.db`, runs `migrate deploy` with `DATABASE_URL` set to that file, and seeds. `afterAll` disconnects and deletes the file.

What the tests actually prove:

- Both partial indexes reject a second confirmed row.
- The seed counts, the Alfanar mailbox, the ambiguous pair, and the cross-client twin.
- A document inserted before a second seed is still there.

Gaps:

- `jest.config.ts` does not set `maxWorkers`. Only the npm script adds `--runInBand`. `npx jest` can run workers in parallel against the one hard-coded database file.
- The document test asserts `document.count() === 1`. That is true only because no earlier test in the file inserts a document. Reordering the file would fail it for a reason other than the seed.
- The two-candidate case rolls the transaction back. It never leaves the two `CANDIDATE` rows in place.
- Not covered: duplicate `externalId`, duplicate `(scope, contentHash)`, the same hash under two scopes (the case DEV-001 exists for), a `REJECTED` row followed by `CONFIRMED`, a foreign-key miss, and an extra transaction or match that must survive the seed.
- The index test checks the index name, not the `WHERE` text. The insert tests cover the statuses that are in the predicate today.

A fresh checkout can run the suite after `npm install` without `.env`. The test passes its own `DATABASE_URL`. `postinstall` runs `prisma generate`.

### Tests worth adding before phase 4

None of these block the pure matcher. Add them before a route writes documents:

1. Same `contentHash` inserts twice when `scope` differs, and fails when `scope` matches.
2. A second `externalId` fails.
3. `REJECTED` does not block a later `CONFIRMED` on that transaction.
4. An extra transaction id, and a `DocumentMatch` on it, are still present after `seedReferenceData`.
5. `sqlite_master.sql` for both partial indexes contains `CONFIRMED` and `AUTO_CONFIRMED`.
6. Set `maxWorkers: 1` in `jest.config.ts`, or give each run its own database file.

## 4. Version control

This directory is the git repository. Do not initialize a repository in the parent folder.

`.gitignore` excludes `.env` (and keeps `.env.example`), `prisma/*.db`, `.test-db/`, `node_modules`, and `.next`. `.env` holds only `DATABASE_URL="file:./dev.db"`. It stays untracked. Before a commit, run `git status --ignored` and confirm `prisma/dev.db` and `.env` are ignored.

The lockfile pins Next.js 15.5.28, Prisma 6.19.3, Zod 3.25.76, next-safe-action 8.7.3, Jest 29.7.0, and TypeScript 5.9.3. `package.json` still uses `^` on Prisma. Do not upgrade to Prisma 7 to silence the warning about `package.json#prisma`. Prisma 7 removes that seed setting. Stay on 6.19.3 until a deliberate upgrade.

## Recommended fixes

Ask before changing application code. Suggested order:

1. Before phase 4, resolve a relative SQLite URL to an absolute path in `lib/prisma.ts`.
2. Add `maxWorkers: 1` or a unique test database file.
3. Add the five constraint and seed tests listed above.
4. Initialize git only in `brijesh/` when asked.

No schema change is recommended. The migration matches the approved model.
