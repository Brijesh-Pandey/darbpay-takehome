# Discovery and implementation plan

Status: evidence log. The formal specification is now in [README.md](README.md) and [docs/](docs/PROJECT.md). This file keeps the 15 Oct 2026 review of the assignment and both references. Where they disagree, the documents under `docs/` win.

Phase 1 now lives in this directory (Next.js shell, Prisma schema, seed). This log was written before that code. Nothing in `ashu/darb-takehome` or `darb-takehome` was modified, installed, or executed.

Inspected: 15 Oct 2026.

## Boundaries

| Path | Role | Git |
| --- | --- | --- |
| Parent folder | Holds this project and the two reference checkouts. Not this repository. | none |
| `ashu/darb-takehome` | Reference. Remote `https://github.com/ashujhaji/darb-takehome.git`, branch `main`. | clean |
| `darb-takehome` | Reference. Remote `https://github.com/BetaPundit/darb-takehome.git`, branch `main`. This is a sibling of `ashu/`, not a second project inside `ashu/`. | clean |
| `brijesh/` | Next.js project root. This is the repository. | this directory |

Neither reference has a `LICENSE` file or copyright headers. Do not copy source from either repository. Ideas and observed behavior may be reused and rewritten.

The assignment was read from the public gist page for `mchbeib/5901995f44d3d7d1359510bc0dd2fa4d` (`exercise-document-ocr-matching.md`). Tests, dev servers, and seed scripts were not run. Test totals printed in the two READMEs (1140 and 884) are claims, not measurements from this review.

## 1. What the assignment requires

Darb clients must attach a receipt or tax invoice to every card transaction. Drivers send photos on WhatsApp. Suppliers email invoices. The exercise is a document ingestion and matching workflow:

1. Accept documents on email and WhatsApp webhooks.
2. Extract structured fields through a mocked OCR interface.
3. Match each document to a card transaction with an explainable confidence score.
4. Auto-attach a high-confidence match. Send ambiguous matches to review.

Real OCR, email, and WhatsApp providers are out of scope. The work is the pipeline and the matcher. The brief is sized at about 3 hours. If time runs out, cut the review UI and the bonus items, not the matcher edge cases or webhook idempotency.

### Stack the brief names

TypeScript 5 strict, Next.js 15 App Router, Prisma 6 with SQLite, next-safe-action 8, Zod 3, Jest 29. Setup also installs date-fns, lucide-react, Radix slot, class-variance-authority, clsx, tailwind-merge, and the shadcn components button, badge, table, tabs, and tooltip.

Both references converged on Next 15.5.27, Prisma 6.19.3, Zod 3.25.76, next-safe-action 8.7.3, and Jest 29.7.0 after starting from newer majors. That convergence is evidence those majors satisfy the brief. It is not a separate product approval.

### Evaluation

| Criterion | Weight |
| --- | --- |
| Matching engine | 30% |
| Pipeline architecture | 25% |
| Data modeling | 20% |
| Type safety | 15% |
| Testing | 10% |

## 2. Requirement inventory

Priority is Must, Should, or Bonus. Source is the assignment unless marked otherwise.

Verification methods: unit test, route or service test, database test, document, or manual.

### Functional

| ID | Requirement | Priority | Acceptance | Depends on | Verify |
| --- | --- | --- | --- | --- | --- |
| FR-001 | `POST /api/webhooks/email` accepts the sample inbound-parse shape, including attachments with base64 content. | Must | A valid payload is acknowledged and produces one document per supported attachment. | CON-001 | Route test |
| FR-002 | `POST /api/webhooks/whatsapp` accepts the simplified Meta envelope (`entry[].changes[].value.messages[]` with an image id). | Must | A valid image message is acknowledged and produces one document. | CON-001 | Route test |
| FR-003 | Payloads are validated with Zod. Malformed JSON or shape returns 400 with a useful body. | Must | Invalid email, bad base64, and non-JSON each return 400 and store nothing. | FR-001, FR-002 | Route test |
| FR-004 | The same email `messageId` or WhatsApp message `id` does not create a second `Document`. | Must | Redelivery returns success and leaves one row. | FR-013 | Ingestion test |
| FR-005 | The same file bytes do not create a second `Document`. | Must | A new message id with the same bytes is a duplicate. | FR-013 | Ingestion test |
| FR-006 | Webhooks respond quickly and do not return 500 because extraction or matching failed. | Must | A throwing extractor still yields a 2xx webhook response. | FR-007 | Ingestion test |
| FR-007 | A document that fails downstream rests in `FAILED` or `UNMATCHED`, not in a lost request. | Must | Garbage OCR and extractor exceptions are visible as terminal document states. | FR-013 | Ingestion test |
| FR-008 | WhatsApp `image.id` is resolved through a `MediaStore` backed by an in-repo fixture map. | Must | A known id returns bytes. An unknown id does not crash the webhook. | FR-002 | Unit test |
| FR-009 | A WhatsApp document may match only that driver's transactions. An email document may match only that client's transactions. | Must | A cross-client twin with the same amount does not auto-match. | FR-014 | Matcher or service test |
| FR-010 | `DocumentExtractor.extract(file, mimeType)` returns the specified `ExtractedDocument`. | Must | The pipeline depends on the interface, not on the mock type. | — | Typecheck and a second fake extractor in tests |
| FR-011 | `MockExtractor` is deterministic and keyed by file hash. | Must | Same bytes always return the same extraction. | FR-010 | Unit test |
| FR-012 | At least six fixture documents exercise the matcher edge cases. | Must | Fixtures exist for FR-022 through FR-027. | FR-011 | Fixture files plus tests |
| FR-013 | Prisma models `Transaction`, `Document`, and `DocumentMatch` use the brief's enums and lifecycle. | Must | States are only `RECEIVED`, `EXTRACTED`, `MATCHED`, `NEEDS_REVIEW`, `UNMATCHED`, `FAILED` and the four match statuses. | CON-002 | Schema review |
| FR-014 | Seed about 15 transactions across 2 clients, with driver phones and email senders. | Must | A fresh database can demonstrate scope and the ambiguous pair. | FR-013 | Seed review and a seed test |
| FR-015 | `matchDocument` is a pure function of the document and candidate transactions. | Must | No I/O, clock, or randomness. Same input, same output. | — | Purity test |
| FR-016 | Scoring uses amount, date proximity, merchant similarity, card last 4, and sender scope. | Must | Each signal is visible in the stored breakdown. | FR-015 | Unit tests |
| FR-017 | Weights and thresholds are documented and justified in `IMPLEMENTATION.md`. | Must | The file states the numbers, why they were chosen, and a worked example of each edge. | FR-016 | Document review |
| FR-018 | One candidate above the high threshold auto-matches: `AUTO_CONFIRMED` match, document `MATCHED`. | Must | The exact fixture ends `MATCHED` with one auto-confirmed row. | FR-016 | Matcher and persistence tests |
| FR-019 | Mid-confidence candidates, or two near-identical scores, become `NEEDS_REVIEW` with ranked candidates persisted. | Must | The same-day pair is not auto-attached. | FR-016 | Matcher test |
| FR-020 | Nothing plausible becomes `UNMATCHED`. | Must | No match rows, document `UNMATCHED`. | FR-016 | Matcher test |
| FR-021 | A transaction that already has a `CONFIRMED` or `AUTO_CONFIRMED` document is not auto-matched again. It goes to review. | Must | A second photo of a matched receipt is `NEEDS_REVIEW`. | FR-031 | Matcher and persistence tests |
| FR-022 | Exact match: one obvious winner. | Must | Auto-match. | FR-018 | Unit test |
| FR-023 | Two same-amount, same-day transactions at the same merchant chain. | Must | Review, not auto-match. | FR-019 | Unit test |
| FR-024 | Amount off by a tip or rounding. The brief's example is receipt 57.50 versus transaction 63.25. | Must | Not a silent auto-attach of the wrong purchase. Review is the safe outcome. | FR-016 | Unit test |
| FR-025 | The same photo sent twice on WhatsApp. | Must | One `Document`. | FR-005 | Ingestion test |
| FR-026 | Invoice for a transaction that does not exist yet. | Must | `UNMATCHED`, no crash. | FR-020 | Unit and pipeline test |
| FR-027 | Extraction returns `UNKNOWN` and a null amount. | Must | `FAILED` or `UNMATCHED`, never a thrown error. | FR-007 | Pipeline test |
| FR-028 | `confirmMatch` confirms the chosen candidate, rejects sibling candidates, and sets the document to `MATCHED`. | Must | One confirmed row remains for that document. | FR-013 | Service test |
| FR-029 | `rejectMatch` rejects the candidate. If none remain, the document becomes `UNMATCHED`. | Must | Last rejection clears the queue item. | FR-013 | Service test |
| FR-030 | Confirm and reject are safe against double-submit. | Must | A second call does not throw and does not write a second confirmation. | FR-028 | Service test |
| FR-031 | One confirmed document per transaction is enforced in the database, not only in UI code. | Must | A racing second confirm fails the constraint and rolls back. | FR-013 | Database test |
| FR-032 | Matcher unit tests cover every edge in FR-022 through FR-027, plus messy merchant strings. | Must | `npm test` covers them without a network. | FR-015 | Jest |
| FR-033 | Ingestion tests cover create-once, redelivery, and extraction failure. | Must | Same as FR-004, FR-005, FR-006. | FR-006 | Jest |
| FR-034 | `README.md` explains setup, seed, sample webhooks, and tests. | Must | A new developer can run the project from the README. | — | Manual |
| FR-035 | `IMPLEMENTATION.md` explains scoring, assumptions, trade-offs, and what was left unfinished. | Must | Includes FR-017 and the multi-transaction sketch if that bonus is claimed. | FR-017 | Document review |

### Non-functional

| ID | Requirement | Priority | Acceptance | Verify |
| --- | --- | --- | --- | --- |
| NFR-001 | TypeScript strict mode. | Must | `strict: true`. | tsconfig |
| NFR-002 | No `any`. | Must | Lint or review finds none in application code. | Lint |
| NFR-003 | Zod at webhook and server-action boundaries. | Must | Handlers do not trust `request.json()` without a schema. | Code review |
| NFR-004 | Every stored candidate can explain its score. | Must | `DocumentMatch.signals` keeps the per-signal breakdown. | Persistence test |
| NFR-005 | The pipeline degrades. A bad document does not take down the process. | Must | `processDocument` does not reject into the webhook response. | Ingestion test |
| NFR-006 | Ambiguous matches prefer a human over a wrong VAT attachment. | Must | Thresholds are precision-first and written down. | IMPLEMENTATION.md |
| NFR-007 | Scope stays appropriate to a 3-hour exercise. | Should | Review UI and bonuses are incremental and removable. | Roadmap |

The brief does not state numeric latency, accessibility, or authentication requirements. Accessibility of the review page and authentication are recommendations, not assignment mandates.

### Constraints

| ID | Constraint | Priority |
| --- | --- | --- |
| CON-001 | Next.js 15 App Router and route handlers. | Must |
| CON-002 | Prisma 6, SQLite. Postgres is not required. | Must |
| CON-003 | next-safe-action 8. | Must |
| CON-004 | Zod 3. | Must |
| CON-005 | Jest 29 with ts-jest. | Must |
| CON-006 | Amounts are integers in minor units (halalas). | Must |
| CON-007 | Currency is ISO 4217. Document dates are ISO 8601. | Must |
| CON-008 | A KSA VAT number, when present, is 15 digits. | Must |
| CON-009 | Suggested file layout and the four boilerplate files (`prisma.ts`, `utils.ts`, `safe-action-client.ts`, `logger.ts`). | Should |
| CON-010 | Submission is a GitHub repository plus README and IMPLEMENTATION.md. | Must, at submission time |

### Bonus, explicit

| ID | Item | Priority |
| --- | --- | --- |
| BON-001 | `/review` listing `NEEDS_REVIEW` documents, ranked candidates, confirm and reject. | Bonus |
| BON-002 | Re-run matching for `UNMATCHED` documents when new transactions arrive. | Bonus |
| BON-003 | Multi-transaction invoice: a design sketch in `IMPLEMENTATION.md` is enough. | Bonus |
| BON-004 | A real extractor behind the same interface, with the mock remaining the default. | Bonus |
| BON-005 | HMAC verification on both webhooks. | Bonus |

### Deviations to document, not hide

The schema is described as a suggested starting point. These departures are intentional and must be written in `IMPLEMENTATION.md`.

| ID | Suggested text | Planned behavior | Why |
| --- | --- | --- | --- |
| DEV-001 | `contentHash` is globally unique. | Unique together with a sender scope. | Two clients may submit the same bytes. A global hash would hide one of them. |
| DEV-002 | `externalId` is the raw message id. | Email ids are `messageId#attachmentIndex`. | One email can carry several attachments, and the column is unique. |
| DEV-003 | No partial indexes are shown. | A partial unique index allows one `CONFIRMED` or `AUTO_CONFIRMED` row per transaction, and another per document. | FR-031 says the rule lives in the database. Prisma cannot express the partial index, so it is appended to the migration by hand. |
| DEV-004 | No `Client` table. | `Client` plus an email-sender table. | FR-009 and FR-014 need a place for the mapping. |
| DEV-005 | Review action uses `.schema()`. | Use `.inputSchema()` if that is the name on next-safe-action 8.7. | The installed 8.x API. Confirm when the dependency is actually installed. Do not claim this until `node_modules` is inspected. |

### Assumptions (not requirements)

| ID | Assumption |
| --- | --- |
| ASM-001 | Calendar days are compared in Asia/Riyadh (UTC+3, no daylight saving). |
| ASM-002 | A tip makes the card charge higher than the receipt, up to 20%. A charge below the receipt beyond a few halalas is a different purchase. |
| ASM-003 | Rounding tolerance is the larger of 5 halalas and 1% of the document amount. |
| ASM-004 | The sample sender `billing@alfanar-fuel.com.sa` is seeded as an allowed mailbox so the sample payload runs. |
| ASM-005 | A 15% pre-VAT gap may be flagged. It goes to review. It does not auto-match. |
| ASM-006 | Webhooks and `/review` have no authentication in this exercise. |
| ASM-007 | `brijesh/` is the application root. |

### Recommendations beyond the brief

| ID | Recommendation | In first build? |
| --- | --- | --- |
| REC-001 | Round scores to 4 decimals before threshold and margin checks. | Yes |
| REC-002 | Block auto-match when the date is missing or scores 0, when OCR confidence is below 0.60, or when the card mismatches. | Yes |
| REC-003 | When one document confirms a transaction, withdraw competing candidate rows on other documents. | Yes |
| REC-004 | Compare-and-set claim from `RECEIVED` to `EXTRACTED`, plus a short processing lease so a crashed worker can be retried. | Yes |
| REC-005 | `noUncheckedIndexedAccess`. | Yes |
| REC-006 | Seed upserts reference data and does not delete documents. | Yes |
| REC-007 | HMAC (BON-005). | No, unless the core is finished |
| REC-008 | A live vision extractor (BON-004). | No |
| REC-009 | Reviewer login. | No |

### Open questions

See section 7. None of these block the recommendation. They block writing application files.

## 3. What each reference implements

Both repositories implement the required pipeline, the six edge cases, review actions, a `/review` page, rematch when transactions arrive, and a multi-transaction sketch. The difference is judgment and how much production machinery sits around that core.

### Ashu (`ashu/darb-takehome`)

Author commit: Ashutosh Jha, 11 Oct 2026. About 89 TypeScript files and 28 Jest files. `IMPLEMENTATION.md` is the best map of this repo and matches the code that was read.

Layout follows the brief: `lib/services/transaction-matcher.ts`, `lib/matching/*`, `lib/services/document-ingestion.ts`, `document-processing.ts`, `match-persistence.ts`, `sender-scope.ts`, `review-decisions.ts`, `rematch.ts`. Routes are thin. Processing runs in `after()`.

Matcher (`lib/services/transaction-matcher.ts`, `lib/matching/config.ts`):

- Weights: amount 0.40, merchant 0.25, card 0.20, date 0.15. `minCoverage` 0.75.
- Unavailable signals are left out of the mean, then confidence is `mean * coverage`. A missing card is not a mismatch.
- Auto threshold 0.85, review floor 0.50, tie margin 0.10, at most 5 candidates.
- Amount outside tolerance is excluded. A merchant score below 0.25 is excluded unless the card matches exactly.
- `UNKNOWN` or an unusable amount returns `UNMATCHED` without throwing.
- An already-confirmed top candidate becomes `NEEDS_REVIEW` with reason `DUPLICATE_OF_CONFIRMED`.

Data (`prisma/schema.prisma`, migration `20261011070210_init`):

- Integer ids. Extraction stored as columns, including `invoiceNumber` and `extractionConfidence`.
- File bytes live on `Document.content`.
- Unique `externalId`. Unique `(scope, contentHash)`.
- Hand-written partial unique indexes: one confirmed match per transaction and one per document (`migration.sql` lines 107–109).

Pipeline: invalid payloads return 400. A failed insert returns 503. Extract and match failures become document states. Duplicate message id or duplicate bytes return the existing row. Unknown senders become `UNMATCHED`. `POST /api/transactions` stores rows and then rematches a capped set of unmatched documents. Confirm and reject use guarded updates. The server action is a wrapper around `review-decisions.ts`.

Gaps and defects:

- A date score of 0 still counts. Amount, merchant, and card at 1.0 reach 0.85, so a stale document can auto-match. The author documents this and leaves it.
- The tie test is raw floating point (`top.confidence - second.confidence <= tieMargin`).
- A weak merchant stays in the list when the card matches. The Panda fixture therefore shows a third, low-quality candidate.
- `seed-data.ts` deletes documents and matches. `IMPLEMENTATION.md` calls the seed safe to re-run. The README is more accurate: it wipes ingested data.
- No HMAC. No sweeper for documents stuck in `RECEIVED`. Review actions are not imported by Jest, because next-safe-action 8 is ESM; the decision service is tested instead. The author says the review UI was not click-tested.
- `date-fns` and `lucide-react` do not appear in application source. `shadcn` is a runtime dependency but is a CLI package. `@radix-ui/react-slot` is declared while the UI uses `@base-ui/react`.
- `AGENTS.md` is the stock Next.js block, not project guidance.
- TypeScript is strict. `noUncheckedIndexedAccess` is off.

### BetaPundit (`darb-takehome`)

Author commit: Aditya Sharma, 15 Oct 2026. About 108 TypeScript files and 42 Jest files. `IMPLEMENTATION.md` is long and mostly consistent with the code. One reason label disagrees with the matcher (below).

Extra structure: `lib/webhooks/handlers/*`, `lib/webhooks/hmac.ts`, `lib/container.ts`, `lib/services/blob-store.ts`, `lib/services/media-store.ts` (Graph API client with an HTTPS host allowlist), `lib/extraction/claude-extractor.ts`, `lib/actions/review-core.ts`. ESLint forbids the matcher from importing Prisma or the filesystem.

Matcher (`lib/services/transaction-matcher.ts`, `lib/config/matching.ts`):

- Weights: amount 0.45, merchant 0.25, date 0.20, card 0.10.
- A missing card contributes 0 and is not renormalized, so a document without last 4 tops out at 0.90.
- Scores are rounded to 4 decimals before comparisons.
- Auto-match also requires OCR confidence at least 0.60, a readable date, a margin of at least 0.10, and a top candidate that is not already confirmed.
- Amount below 0.05 caps the total at 0.49. A card mismatch halves the total.
- Tip scores decline with the size of the tip and stay under the auto threshold in the documented examples.
- Pre-VAT (invoice times 1.15) can score about 0.855 and auto-match. That is a product risk.
- Scope is a hard filter inside the pure function. The signature is not the brief's `matchDocument(doc, transactions)`.

Data:

- String cuid ids. `confirmMatch` takes `z.string()`, not `z.number()`.
- Extraction is one JSON column, revalidated with Zod on read.
- Unique `(source, externalMessageId, attachmentIndex)` and `(scopeKey, contentHash)`.
- One partial unique index, on the transaction only (`one_confirmed_per_txn`).
- `processingStartedAt` lease of 5 minutes. `reprocessStale()` exists and nothing schedules it.
- Relative SQLite URLs are resolved before Prisma sees them, because Next's bundle directory confused `file:` paths. That bug is real and worth remembering.

Pipeline: body size cap, HMAC over the raw bytes with `timingSafeEqual`, fail closed in production when the secret is missing, skip the check outside production. Unknown email senders are acknowledged and not stored. Unknown WhatsApp numbers are stored. Confirm re-checks scope. Competing offers are withdrawn inside the same transaction as an auto-confirm or a reviewer confirm. Lost auto-confirm races are retried and end in review.

Gaps:

- `IMPLEMENTATION.md` section 3.3 labels the tip outcome reason `TIP_SUSPECTED`. The matcher reason is `BELOW_AUTO_THRESHOLD`. The flag is `TIP_SUSPECTED`. Tests follow the code.
- Token-subset merchant similarity scores 1.0 when the document name is only a generic token such as "Retail".
- Claude extraction is optional and, by the author's own note, was not verified against the live API.
- `components/ui/table.tsx` is unused. `sonner` reads `useTheme` without a `ThemeProvider` in `app/layout.tsx`.
- No authentication on `/review`.
- The surface area (Postman, signed and unsigned environments, SSRF-hardened media client, concurrency stress tests) is past a 3-hour submission. The core is still coherent.

## 4. Comparison

| Lens | Ashu | BetaPundit | Classification |
| --- | --- | --- | --- |
| Requirement coverage | Required items plus review, rematch, and the invoice sketch. No HMAC, no live OCR. | Same, plus HMAC and an optional Claude extractor. | Both satisfy the musts. HMAC and live OCR stay bonus. |
| Business rules | Sound and conservative, except stale-date auto-match and the card-saves-weak-merchant exception. | Sound gates. Pre-VAT auto-match and generous token subset are the weak spots. | Improve both before adopting. |
| Workflows | Accept, process, review, rematch. Stuck `RECEIVED` waits for redelivery. | Same, plus lease, stale recovery function, and offer withdrawal. | Reuse the flow. Add the lease and offer withdrawal. |
| Architecture | Close to the brief. Easy to enter. | More ports and policies. Harder to enter, safer at the edges. | Reuse Ashu's module cut. |
| Readability | High. Scoring math is local. | High inside each file, high overall volume. | Prefer the smaller shape. |
| Extensibility | Extractor factory is one seam. | Extractor, blob, and media are all interfaces. | One extractor seam and one media seam are enough. |
| Tests | Matcher, ingestion, constraints, concurrent decisions. UI and the action module are thin. | Broad, including races, HMAC, redaction, and assignment sample payloads. | Reuse the scenario list. Do not chase the file count. |
| Security | Open webhooks and open review. Bytes in SQLite. Logs avoid raw text. | HMAC, redaction, SSRF controls, still no review auth. | HMAC later. Do not log bodies. No auth in v1, stated as ASM-006. |
| Performance | Loads every in-scope transaction. Fine for 15 rows. | Date window and a 200-row cap. | Window the query. Do not add a queue. |
| Docs | Strong `IMPLEMENTATION.md`. README disagrees about the seed and the review success message. | Strong `IMPLEMENTATION.md` and README. One reason name is wrong. | Write one scoring section and keep it next to the constants. |
| Build reliability | Not executed here. Seed path and Prisma 6 notes look coherent. | Not executed here. The SQLite URL fix is evidence they hit a real Next build issue. | Resolve `file:` URLs the same way if the page 500s. |

## 5. Proposed target

### Stack

The assignment stack, pinned only when dependencies are installed: Next.js 15, Prisma 6, Zod 3, next-safe-action 8, Jest 29, TypeScript 5 strict, Tailwind, the shadcn components the brief installs. SQLite. No Anthropic SDK in the first build.

`noUncheckedIndexedAccess` is on. The matcher module is forbidden, by ESLint, from importing Prisma, `fs`, or `path`.

### Modules

```
app/api/webhooks/email/route.ts
app/api/webhooks/whatsapp/route.ts
app/api/transactions/route.ts          # bonus trigger for rematch
app/review/page.tsx                    # after the pipeline
lib/prisma.ts
lib/extraction/types.ts                # the brief's interface
lib/extraction/mock-extractor.ts
lib/extraction/fixtures.ts
lib/media/fixture-media-store.ts
lib/matching/config.ts                 # every threshold lives here
lib/matching/signals.ts
lib/matching/normalize.ts
lib/matching/similarity.ts
lib/services/transaction-matcher.ts    # pure
lib/services/sender-scope.ts
lib/services/document-ingestion.ts
lib/services/document-processing.ts
lib/services/match-persistence.ts
lib/services/review-decisions.ts
lib/services/rematch.ts
lib/actions/review.ts                  # thin
prisma/schema.prisma
prisma/seed.ts
fixtures/
__tests__/matching/
__tests__/ingestion/
```

Routes parse and call services. Services own transactions and state changes. The matcher receives already scoped candidates, matching the brief's signature, so a caller cannot forget a filter without a service test also failing. Each candidate carries `hasConfirmedDocument`. Scope is tested at the service boundary, not re-implemented as a second algorithm inside the matcher.

### Scoring

This is a new design. It uses Ashu's treatment of missing signals and BetaPundit's gates. It does not copy either formula.

| Signal | Weight | Behavior |
| --- | --- | --- |
| Amount | 0.40 | Exact = 1. Within the rounding band = 0.9. Charge above the receipt by at most 20% = 0.5, flag `TIP`, and block auto-match. Any other difference excludes the candidate. |
| Merchant | 0.25 | Normalize case, punctuation, legal suffixes, branch numbers, and the city codes `RUH`, `JED`, `DMM`. Expand `ST` to `station`. Similarity is the max of a token score and a character score. A single generic token must not produce 1.0. Score under 0.25 excludes the candidate. A card hit does not override that exclusion. |
| Card | 0.20 | Equal = 1, differ = 0, missing = unavailable. A 0 blocks auto-match. |
| Date | 0.15 | Riyadh calendar days. Same day = 1, then linear down to 0 at 8 days. Unavailable, or a score of 0, blocks auto-match. |

Combine the available signals as a weighted mean. Multiply by `min(1, availableWeight / 0.75)`. Round to 4 decimals.

| Outcome | Rule |
| --- | --- |
| `UNMATCHED` | `UNKNOWN`, non-positive amount, no candidates, or nothing at or above 0.50. |
| `AUTO_MATCHED` | Top score at least 0.85, lead over the next greater than 0.10, OCR confidence at least 0.60, date usable and non-zero, card not a mismatch, transaction not already confirmed. |
| `NEEDS_REVIEW` | Otherwise, when at least one candidate is at or above 0.50. Persist at most 5, best first. |

Worked targets the tests will lock:

| Case | Expected |
| --- | --- |
| Exact amount, merchant, date, and card | `AUTO_MATCHED` |
| Same amount and day, two branches | `NEEDS_REVIEW` |
| 57.50 versus 63.25, same merchant and day | `NEEDS_REVIEW` with a tip flag |
| Second photo after an auto-confirm | `NEEDS_REVIEW`, not a second auto-confirm |
| No transaction in scope | `UNMATCHED` |
| `UNKNOWN` and null amount | `UNMATCHED` or `FAILED` at the pipeline layer, no throw |
| Amount and merchant exact, no card, same day | May auto-match, because coverage of 0.65 / 0.75 is about 0.87 |
| Everything exact except the date is missing | `NEEDS_REVIEW` |

Pre-VAT is ASM-005: flag it, send it to review, do not auto-match.

### Persistence and errors

- Insert `RECEIVED`, respond, then process in `after()`.
- Claim with a compare-and-set on status, and a lease so a dead worker is recoverable. No cron in v1. Redelivery of a still-`RECEIVED` document schedules processing again.
- Document update and match rows commit in one database transaction.
- On the partial unique index, roll back, reload, and decide again. The second document goes to review.
- Withdrawing competing offers runs in that same transaction.
- Confirm and reject are guarded on `CANDIDATE`. A repeated click returns a typed "already decided" result.
- Rejected pairs are not offered again.
- The webhook returns 500 only for a programmer fault or a misconfigured server. A failed store may return 503 so the provider retries. Extraction and matching never cause that.

### Rematch and review

`POST /api/transactions` upserts by an external reference, responds, then rematches `UNMATCHED` documents whose reason can still change (no candidates, nothing plausible, unknown sender, all candidates rejected). It does not rematch garbage extractions.

`/review` is a server-rendered list of `NEEDS_REVIEW` documents. Each candidate shows amount, date, merchant, card, confidence, and flags, with confirm and reject. Empty, error, and already-decided states are part of the page. This is built only after increment 5.

### Alternatives rejected

| Alternative | Why it was rejected |
| --- | --- |
| Copy either repository | No license. Also imports their known defects. |
| BetaPundit's full layout (handlers, blob store, Claude, Postman) | Solves problems the exercise does not grade. Harder for the next reader. |
| Cuid primary keys | The brief's action takes `z.number()`. Integer ids match that. Guessable ids are acceptable on an unauthenticated local exercise (ASM-006). |
| Train or call an LLM to judge matches | No labelled data. A financial attachment needs a deterministic explanation. |
| Global unique `contentHash` | Breaks the two-client case. DEV-001. |
| Auto-match a 15% VAT difference | Too close to 0.85 and too easy to attach the wrong charge. |
| Drop the per-document confirmed index | Right for a future statement that covers many transactions. Wrong while one document attaches to one transaction. The sketch in `IMPLEMENTATION.md` says to drop it then. |

### Security

No authentication in v1. Say so in the README. Do not log file bytes, base64, or `rawText`. Validation errors should name the field. Cap decoded attachment size (10 MiB is enough). Hash the bytes we fetched, not the hash the webhook claims. Fixture media ids are map keys, and mapped paths must stay inside `fixtures/`.

## 6. Documentation package

Keep the assignment's two required files, plus a thin `docs/` folder. Do not create `AGENTS.md` until this plan is approved.

| File | Purpose | When |
| --- | --- | --- |
| `README.md` | Setup, seed, curl or `.http` samples, tests. | With the first runnable increment |
| `IMPLEMENTATION.md` | Scoring, thresholds, assumptions, deviations, trade-offs, multi-transaction sketch, unfinished work. | Grows with the matcher; finished before submission |
| `docs/requirements.md` | This inventory, updated if a decision changes an ID. | After approval, moved out of this file |
| `docs/architecture.md` | Module rules, state diagram, request path, SQL constraints. | With increment 1 |
| `docs/decisions/0001-scoring-gates.md` | Why missing date and low OCR confidence block auto-match. | With increment 2 |
| `docs/decisions/0002-scoped-content-hash.md` | DEV-001 and DEV-002. | With increment 1 |
| `docs/decisions/0003-integer-ids.md` | Why not cuids. | With increment 1 |
| `docs/test-strategy.md` | ID to test file. | With increment 2, extended as tests appear |
| `AGENTS.md` | Conventions for later work: strict TypeScript, no `any`, matcher purity, do not edit the reference repos. | Only after approval |

This `DISCOVERY.md` stays as the record of the review. It should not be rewritten into a second architecture guide.

### Test matrix

| ID | Test |
| --- | --- |
| FR-015, FR-016, FR-018–024, FR-026, REC-001, REC-002 | `__tests__/matching/transaction-matcher.test.ts` |
| FR-032 merchant strings | `__tests__/matching/normalize.test.ts` and `similarity.test.ts` |
| FR-003, FR-004, FR-005, FR-006, FR-007, FR-025, FR-027 | `__tests__/ingestion/webhooks.test.ts` |
| FR-008, FR-011, FR-012 | `__tests__/ingestion/extractor.test.ts` |
| FR-009, FR-014 | `__tests__/ingestion/sender-scope.test.ts` |
| FR-021, FR-028–031, REC-003 | `__tests__/ingestion/review-and-constraints.test.ts` |
| BON-002 | `__tests__/ingestion/rematch.test.ts` |
| BON-001 | Manual browser pass, plus a render test only if it stays cheap |

Also: a purity test that the matcher module does not import Prisma, and a migration test that both partial indexes exist.

### Roadmap

| Step | Stop condition |
| --- | --- |
| 0 | This plan approved. |
| 1 | Schema, hand-written partial indexes, seed of 2 clients and 15 transactions. Seed can run twice without deleting documents. |
| 2 | Pure matcher and the six edges. No HTTP yet. |
| 3 | Mock extractor, at least six fixtures, media map. |
| 4 | Both webhooks. 400, duplicate id, duplicate bytes, extractor failure still 2xx. |
| 5 | Match persistence, confirm, reject, constraint races. |
| 6 | Transaction intake and rematch. |
| 7 | `/review`, then a browser pass of confirm, reject, empty queue, and a failed double-submit. |
| 8 | HMAC only if 1–7 are done. Live OCR stays out. |

Quality gate on each step: `tsc --noEmit`, ESLint, Jest. No dependency install until step 1 is approved.

## 7. Risks and unresolved questions

### Risks

- Neither reference was executed. A behavior described above could still fail at runtime. The citations are from source that was read.
- Claimed test counts were not reproduced.
- `after()` is not durable. A crash leaves `RECEIVED`. The lease and redelivery cover the exercise. A queue is production work.
- SQLite has one writer. Tests should use one Jest worker or one connection.
- next-safe-action 8 may not load under Jest's CommonJS runner. Test the decision service directly, as Ashu did, and keep the action file thin.
- Prisma `migrate dev` can drift from a hand-written partial index. The constraint test must fail if the index disappears.
- Scoring numbers are judgment. They need the worked examples in section 5 locked as tests before any UI work.
- Building the BetaPundit surface "to be safe" will miss the 3-hour point of the exercise and make the next change harder.

### Questions

Answered on 15 Oct 2026. The accepted records are ADR 0001 through ADR 0007. Do not treat the questions below as still open.

1. `brijesh/` is the Next.js root. Accepted.
2. Integer ids. Accepted in ADR 0001.
3. HMAC and a live extractor wait until after the review page. Accepted in ADR 0002.
4. The scoring, idempotency, index, storage, rematch, and review-page proposal is accepted, with the missing-date and email-scope corrections in ADR 0004 and ADR 0007. Implementation has not been requested.

## 8. Next step

The current plan is [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md). This section's old phase list is not the build order.
