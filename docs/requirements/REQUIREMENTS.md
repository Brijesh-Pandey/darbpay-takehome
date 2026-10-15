# Requirements

The assignment gist `mchbeib/5901995f44d3d7d1359510bc0dd2fa4d` is the source of truth. IDs are stable. Design notes that go past the assignment are `proposed` until accepted.

Status words:

| Status | Meaning |
| --- | --- |
| `approved` | Accepted to build. No application code yet. |
| `proposed` | Not accepted. Do not treat it as a settled rule. |

Related: [USER_FLOWS.md](USER_FLOWS.md), [REQUIREMENT_TRACEABILITY.md](../REQUIREMENT_TRACEABILITY.md), [PROJECT.md](../PROJECT.md).

## Functional

### Inbound documents

| ID | Status | Priority | Requirement | Source | Rationale | Acceptance | Depends on | Verify |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FR-001 | approved | Must | `POST /api/webhooks/email` accepts the sample inbound-parse body: `messageId`, `from`, `to`, `subject`, `receivedAt`, and `attachments[]` of `{ filename, contentType, contentBase64 }`. | Assignment, webhook payloads | This is the email entry point. | A valid payload is acknowledged and creates one document per supported attachment. | CON-001 | Route test |
| FR-002 | approved | Must | `POST /api/webhooks/whatsapp` accepts the simplified Meta envelope: `entry[].changes[].value.messages[]` with `id`, `from`, `timestamp`, `type: image`, and `image.id` / `mime_type` / `sha256`. | Assignment, webhook payloads | This is the WhatsApp entry point. | A valid image message is acknowledged and creates one document. | CON-001 | Route test |
| FR-003 | approved | Must | Zod validates both payloads. Malformed JSON or shape returns 400 with a useful body. | Assignment, webhook requirements | Callers must be able to fix a bad request. | Invalid email, bad base64, and non-JSON each return 400 and store nothing. | FR-001, FR-002 | Route test |
| FR-004 | approved | Must | The same email `messageId` or WhatsApp message `id` does not create a second `Document`. | Assignment, idempotency | Providers redeliver. | A second delivery returns success and leaves one row. | FR-013 | Ingestion test |
| FR-005 | approved | Must | The same file content, identified by a hash, does not create a second `Document`. | Assignment, idempotency | The same photo can arrive under a new message id. | A new message id with the same bytes is a duplicate. | FR-013 | Ingestion test |
| FR-006 | approved | Must | Webhooks stay fast and do not return 500 because extraction or matching failed. | Assignment, webhook requirements | Downstream OCR fails often. The provider must not retry forever for a bad scan. | A throwing extractor still yields a 2xx response. | FR-007 | Ingestion test |
| FR-007 | approved | Must | A document that fails downstream rests in `FAILED` or `UNMATCHED`. | Assignment, webhook requirements | The file is not lost with the HTTP request. | Garbage OCR and extractor exceptions are visible as terminal states. | FR-013 | Ingestion test |
| FR-008 | approved | Must | WhatsApp `image.id` is resolved through a `MediaStore` interface backed by an in-repo map of media id to a file under `fixtures/`. | Assignment, WhatsApp media | The pipeline must not call Meta. | A known id returns bytes. An unknown id does not crash the webhook. | FR-002 | Unit test |
| FR-009 | approved | Must | A WhatsApp document may match only transactions for that driver's phone. An email document may match only transactions for that client. | Assignment, sender scoping | Stops a receipt from attaching to another fleet's card. | A same-amount transaction on another client or phone is not chosen. | FR-014 | Service test |

### Extraction

| ID | Status | Priority | Requirement | Source | Rationale | Acceptance | Depends on | Verify |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FR-010 | approved | Must | `DocumentExtractor.extract(file, mimeType)` returns `ExtractedDocument` as specified: type `RECEIPT`, `TAX_INVOICE`, or `UNKNOWN`; nullable merchant, 15-digit VAT number, total in minor units, ISO currency, ISO 8601 date, card last 4, invoice number; `rawText`; `extractionConfidence` from 0 to 1. | Assignment, `lib/extraction/types.ts` | A real provider must be able to replace the mock. | Production code depends on the interface, not on the mock's class. | — | Typecheck, plus a fake extractor in tests |
| FR-011 | approved | Must | `MockExtractor` is deterministic and keyed by a hash of the file bytes. | Assignment, OCR section | Reviewers run without API keys. | The same bytes always return the same extraction. | FR-010 | Unit test |
| FR-012 | approved | Must | At least six fixture documents exercise the matcher edges. | Assignment, OCR section | The edges are how the matcher is graded. | Fixtures exist for FR-022 through FR-027. | FR-011 | Files plus tests |

### Data

| ID | Status | Priority | Requirement | Source | Rationale | Acceptance | Depends on | Verify |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FR-013 | approved | Must | Prisma models `Transaction`, `Document`, and `DocumentMatch` use the assignment enums and the documented lifecycle. | Assignment, Prisma schema. Marked there as a suggested starting point. | Shared language for status. | Document statuses are only `RECEIVED`, `EXTRACTED`, `MATCHED`, `NEEDS_REVIEW`, `UNMATCHED`, `FAILED`. Match statuses are only `CANDIDATE`, `AUTO_CONFIRMED`, `CONFIRMED`, `REJECTED`. | CON-002 | Schema review |
| FR-014 | approved | Must | Seed about 15 transactions across 2 clients, with driver-phone and email-sender mappings. | Assignment, seed section | The matcher needs realistic scope and an ambiguous pair. | A fresh database can show sender scope and two same-day charges at one chain. | FR-013 | Seed test |

### Matching

| ID | Status | Priority | Requirement | Source | Rationale | Acceptance | Depends on | Verify |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FR-015 | approved | Must | `matchDocument` is a pure function of the extracted fields and the candidate transactions. | Assignment, matching engine | Most of the test effort belongs here. | No I/O, clock, or randomness. Same input, same output. | — | Purity test |
| FR-016 | approved | Must | Scoring uses amount (exact and a small tolerance), date proximity, fuzzy merchant name, card last 4, and sender scope. Weights and thresholds are explicit. | Assignment, signals list | These are the facts a reviewer can check. | Each available signal appears in the breakdown. | FR-015 | Unit tests |
| FR-017 | approved | Must | Weights and thresholds are written and justified in root `IMPLEMENTATION.md`. | Assignment, deliverables | The grey zone is part of the grade. | The file shows the numbers and a worked example of each required edge. | FR-016 | Document review |
| FR-018 | approved | Must | A single candidate above the high threshold auto-matches: create an `AUTO_CONFIRMED` match and set the document to `MATCHED`. | Assignment, outcome rules | The happy path. | The exact fixture ends `MATCHED` with one auto-confirmed row. | FR-016 | Matcher and persistence tests |
| FR-019 | approved | Must | One or more mid-confidence candidates, or two candidates with near-identical scores, become `NEEDS_REVIEW`. Ranked candidates are stored. | Assignment, outcome rules | Two same-day charges must not be guessed. | The ambiguous pair is not auto-attached. | FR-016 | Matcher test |
| FR-020 | approved | Must | Nothing plausible becomes `UNMATCHED`. | Assignment, outcome rules | Do not invent a match. | No match rows. Document `UNMATCHED`. | FR-016 | Matcher test |
| FR-021 | approved | Must | A transaction that already has a `CONFIRMED` or `AUTO_CONFIRMED` document is not auto-matched to a second document. Route it to review. | Assignment, outcome rules | A second photo may be a duplicate receipt. | A second photo of an already matched receipt is `NEEDS_REVIEW`. | FR-031 | Matcher and persistence tests |
| FR-022 | approved | Must | Edge: one exact winner. | Assignment, edge 1 | Auto-match. | Covered by FR-018's fixture. | FR-018 | Unit test |
| FR-023 | approved | Must | Edge: two same-amount, same-day transactions at the same merchant chain. | Assignment, edge 2 | Review. | Not auto-matched. | FR-019 | Unit test |
| FR-024 | approved | Must | Edge: amount off by a tip or rounding. The brief's pair is receipt 57.50 versus charge 63.25. | Assignment, edge 3 | A tip is plausible and not proof. | The case is not a silent auto-attach. Review is the required safe outcome. | FR-016 | Unit test |
| FR-025 | approved | Must | Edge: the same photo submitted twice on WhatsApp. | Assignment, edge 4 | Idempotency a person will actually hit. | One `Document`. | FR-005 | Ingestion test |
| FR-026 | approved | Must | Edge: an invoice whose transaction does not exist. | Assignment, edge 5 | Documents arrive before the card feed. | `UNMATCHED`. No throw. | FR-020 | Unit and pipeline test |
| FR-027 | approved | Must | Edge: extraction is garbage (`documentType: UNKNOWN`, null amount). | Assignment, edge 6 | OCR returns noise. | `FAILED` or `UNMATCHED`. No throw. | FR-007 | Pipeline test |

### Review actions

| ID | Status | Priority | Requirement | Source | Rationale | Acceptance | Depends on | Verify |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FR-028 | approved | Must | `confirmMatch` accepts a match id, confirms that candidate, rejects sibling candidates, and sets the document to `MATCHED`. | Assignment, `lib/actions/review.ts` | The human path has to finish the attachment. | One confirmed row remains for that document. | FR-013 | Service test |
| FR-029 | approved | Must | `rejectMatch` rejects that candidate. If no candidates remain, the document becomes `UNMATCHED`. | Assignment, review actions | An empty queue item must not sit in review. | The last rejection clears it. | FR-013 | Service test |
| FR-030 | approved | Must | Confirm and reject are safe when submitted twice. | Assignment, review actions | Double-clicks happen. | The second call does not throw and does not write a second confirmation. | FR-028 | Service test |
| FR-031 | approved | Must | One confirmed document per transaction is enforced in the database, not only in the UI. | Assignment, review actions | Application checks race. | A second confirm of the same transaction rolls back. | FR-013 | Database test |

### Proof and write-ups

| ID | Status | Priority | Requirement | Source | Rationale | Acceptance | Depends on | Verify |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FR-032 | approved | Must | Matcher unit tests cover FR-022 through FR-027, and normalization tests use messy merchant strings such as `ALFANAR FUEL ST 04 RUH` against `Alfanar Fuel Station`. | Assignment, tests | This is the 10% testing grade and the 30% matcher grade. | `npm test` covers them without a network. The command is not validated yet. | FR-015 | Jest |
| FR-033 | approved | Must | Ingestion tests cover a valid create, a redelivery, and an extraction failure landing in a terminal state. | Assignment, tests | Proves FR-004, FR-005, and FR-006. | Those three cases exist as tests. | FR-006 | Jest |
| FR-034 | approved | Must | `README.md` explains setup, seeding, sample webhooks, and how to run tests. | Assignment, submission | A reviewer should not need this chat. | Setup, seed, and tests were run in phase 1 and match the README. Sample webhook commands are still phase 4. | — | Manual |
| FR-035 | approved | Must | Root `IMPLEMENTATION.md` records the approach, assumptions, trade-offs, and unfinished work. | Assignment, submission | Required deliverable, separate from `docs/`. | Includes FR-017. Includes the BON-003 sketch if that bonus is claimed. | FR-017 | Document review |

## Non-functional

The assignment does not set a latency budget, an accessibility standard, or an authentication requirement.

| ID | Status | Priority | Requirement | Source | Rationale | Acceptance | Depends on | Verify |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NFR-001 | approved | Must | TypeScript 5 strict mode. | Assignment, stack table | Graded under type safety. | `strict: true`. | CON-001 | tsconfig review |
| NFR-002 | approved | Must | No `any` in application code. | Assignment, "What we're looking for" | Same grade. | Lint or review finds none. | NFR-001 | Lint |
| NFR-003 | approved | Must | Zod at webhook and server-action boundaries. | Assignment, type safety | Untrusted JSON stops at the edge. | Handlers do not use an unparsed body as the domain type. | CON-004 | Code review and route tests |
| NFR-004 | approved | Must | A stored candidate can explain its score. | Assignment, `signals` JSON and the 30% criterion | A reviewer must see why a row ranked where it did. | `DocumentMatch.signals` keeps the per-signal numbers. | FR-016 | Persistence test |
| NFR-005 | approved | Must | The pipeline degrades. One bad document does not take down the process. | Assignment, error handling | Same idea as FR-006, stated as a quality bar. | `processDocument` cannot reject into the webhook response. | FR-006 | Ingestion test |
| NFR-006 | approved | Must | Ambiguous matches prefer a person over a wrong VAT attachment. | Assignment, judgement under ambiguity | A wrong auto-attach is worse than one click. | Thresholds are precision-first and written in `IMPLEMENTATION.md`. | FR-017 | Document review |
| NFR-007 | approved | Should | Stay inside a small-exercise scope. | Assignment, time expectation | Completeness of the edges beats extra surface area. | The review UI and bonuses are later phases and can be skipped. | — | [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) |

## Constraints

| ID | Status | Priority | Constraint | Source |
| --- | --- | --- | --- | --- |
| CON-001 | approved | Must | Next.js 15, App Router, route handlers for webhooks. | Stack table |
| CON-002 | approved | Must | Prisma 6 and SQLite. Postgres is not required. | Stack table and setup note |
| CON-003 | approved | Must | next-safe-action 8 for confirm and reject. | Stack table |
| CON-004 | approved | Must | Zod 3. | Stack table |
| CON-005 | approved | Must | Jest 29. The sample config uses ts-jest, `node` environment, `@/` mapped to the root, and `**/__tests__/**/*.test.ts`. | Stack table and sample `jest.config.ts` |
| CON-006 | approved | Must | Amounts are integers in minor units (halalas). | `ExtractedDocument.totalAmount` and `Transaction.amount` |
| CON-007 | approved | Must | Currency is ISO 4217. Document dates are ISO 8601. | Extractor interface |
| CON-008 | approved | Must | A VAT number, when present, is a 15-digit KSA number. | Extractor interface |
| CON-009 | approved | Should | Follow the suggested layout and ship `lib/prisma.ts`, `lib/utils.ts`, `lib/actions/safe-action-client.ts`, and `lib/logger.ts` in the form the brief shows. | Project structure and boilerplate |
| CON-010 | approved | Must | Submission is a GitHub repository plus README and `IMPLEMENTATION.md`. | Submission section. Not started. |
| CON-011 | approved | Must | The project root is `brijesh/`. Package name `darb-takehome`. | Accepted 15 Oct 2026 |
| CON-012 | approved | Must | Primary keys are integers. | Accepted 15 Oct 2026. See [ADR 0001](../decisions/0001-integer-primary-keys.md). |

The setup script also installs date-fns, lucide-react, and the shadcn components button, badge, table, tabs, and tooltip. Those are setup constraints for the UI phase, not a requirement to use every component. `table` may go unused. That matches the brief's install list without inventing a screen that needs it.

## Bonus

| ID | Status | Priority | Requirement | Source | Acceptance | Verify |
| --- | --- | --- | --- | --- | --- | --- |
| BON-001 | approved | Bonus | `/review` lists `NEEDS_REVIEW` documents with ranked candidates and confirm/reject controls. | Assignment, bonus. Kept by Q-005. | A reviewer can finish FR-028 and FR-029 from the page. | Browser pass after the API exists |
| BON-002 | approved | Bonus | When new transactions arrive, matching runs again for `UNMATCHED` documents that can still match. | Assignment, bonus. Kept by Q-005. | A document that was unmatched because the charge did not exist becomes matched or reviewed after the charge is stored. | Service test |
| BON-003 | proposed | Bonus | Multi-transaction invoices are described in `IMPLEMENTATION.md`. Working code is not required. | Assignment, bonus | The sketch says how several charges would attach, and what would stay human-only. | Document review |
| BON-004 | proposed | Bonus | A real extractor can sit behind `DocumentExtractor`. The mock stays the default so reviewers need no keys. | Assignment, bonus. Deferred by [ADR 0002](../decisions/0002-defer-hmac-and-live-extractor.md). | Not built before the review page. | Later |
| BON-005 | proposed | Bonus | HMAC verification on both webhooks. | Assignment, bonus. Deferred by ADR 0002. | Not built before the review page. | Later |

BON-001 and BON-002 are planned work, still `proposed` because they are optional and this documentation pass did not ask to freeze them as commitments. The implementation plan schedules them after the must-haves. Say so if they should be dropped.

## Accepted deviations

The schema is a suggested starting point. These changes are accepted. They are not assignment sentences, and `IMPLEMENTATION.md` must mention them. Records: [ADR 0003](../decisions/0003-idempotency-keys.md), [ADR 0005](../decisions/0005-confirmed-match-constraints.md), [ADR 0006](../decisions/0006-processing-model.md), [ADR 0007](../decisions/0007-email-sender-scope.md).

| ID | Status | Suggested text | Proposal | Why it is not silent |
| --- | --- | --- | --- | --- |
| DEV-001 | approved | `contentHash` is globally unique. | Unique together with a sender scope. | Two clients can submit the same bytes. A global hash would hide one of them. |
| DEV-002 | approved | `externalId` is the raw message id. | Email ids are `messageId#attachmentIndex`. | One message can carry several attachments, and the column is unique. |
| DEV-003 | approved | The sample schema has no partial indexes. | Hand-written partial unique indexes: one confirmed match per transaction, and one per document. | FR-031 requires a database rule. Prisma cannot express a partial index. The per-document index is extra and only fits one-document-to-one-transaction matching. |
| DEV-004 | approved | No client table is shown. | `Client` and `ClientEmailSender`, integer ids. [ADR 0007](../decisions/0007-email-sender-scope.md). | FR-009 and FR-014 need a place for the email mapping. Ashu's version matches the accepted integer ids and stores an unknown sender as `UNMATCHED`. |
| DEV-005 | approved | The sample action uses `.schema()`. | Call `.inputSchema()`. Installed 8.7.3 marks `.schema()` as a deprecated alias. | Phase 6 writes the actions. The alias still typechecks, so the sample would not fail today. |

## Recommendations

Accepted with the proposal, except REC-003, which stays optional.

| ID | Status | Proposal | When |
| --- | --- | --- | --- |
| REC-001 | approved | Round confidence to 4 decimal places before comparing it with a threshold or a margin. | Yes, in the matcher |
| REC-002 | approved | Block auto-match when a present date scores 0, when extraction confidence is below 0.60, or when the card last 4 mismatches. A missing date does not block auto-match. | Yes, in the matcher |
| REC-003 | proposed | When one document confirms a transaction, withdraw competing `CANDIDATE` rows on other documents in the same database transaction. | Optional, with review persistence |
| REC-004 | approved | Claim a `RECEIVED` document with a compare-and-set, and record a processing lease so a crashed worker can be retried. | Yes, with the pipeline |
| REC-005 | approved | Turn on `noUncheckedIndexedAccess`. | Yes, with the TypeScript config |
| REC-006 | approved | Seeding reference data must not delete documents that arrived through webhooks. | Yes, with the seed |

## Assumptions

Visible so they are not mistaken for assignment text.

| ID | Assumption | If it is wrong |
| --- | --- | --- |
| ASM-001 | Calendar days are compared in Asia/Riyadh (UTC+3, no daylight saving). | Date scores shift for evening charges. |
| ASM-002 | A tip makes the card charge higher than the receipt, by at most 20% of the receipt. A charge below the receipt, beyond a few halalas, is a different purchase. | The 57.50 versus 63.25 case could be scored differently. |
| ASM-003 | Rounding tolerance is the larger of 5 halalas and 1% of the document amount. | Near-equal amounts could auto-match or drop. |
| ASM-004 | The sample sender `billing@alfanar-fuel.com.sa` is seeded as an allowed mailbox so the sample email runs. | The sample call would be an unknown sender. |
| ASM-005 | A 15% pre-VAT gap is not scored in the first matcher. The assignment does not require it, and auto-matching it is rejected in ADR 0004. | Add it later only as a review flag, never as an auto-match. |
| ASM-006 | Webhooks and `/review` have no authentication in this exercise. | A real deployment would put the portal's auth in front. |
| ASM-007 | Phone numbers in the sample (`966551234567`) normalize to E.164 (`+966551234567`) before they are compared with `driverPhone`. | Scope checks would miss the seeded driver. |

## Resolved questions

Accepted on 15 Oct 2026. They no longer block a phase.

| ID | Decision | Record |
| --- | --- | --- |
| Q-001 | Weights 0.40 / 0.25 / 0.20 / 0.15, auto at 0.85, review floor 0.50, tie margin 0.10. A missing document date does not block auto-match. A present date that scores 0 does. No pre-VAT rule. | [ADR 0004](../decisions/0004-scoring-and-auto-match-gates.md) |
| Q-002 | Content hash is unique per sender. Email external id is `messageId#attachmentIndex`. | [ADR 0003](../decisions/0003-idempotency-keys.md) |
| Q-003 | Partial unique indexes: one confirmed match per transaction, and one per document. | [ADR 0005](../decisions/0005-confirmed-match-constraints.md) |
| Q-004 | Store file bytes on the document row. Process after the response. | [ADR 0006](../decisions/0006-processing-model.md) |
| Q-005 | Keep rematch (BON-002) and `/review` (BON-001) after the must-have pipeline. | [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) phases 7 and 8 |

DEV-005 and the exact webhook error JSON keys are still open. They do not block phase 1.

## Evaluation, for context

Not requirements. The assignment weights the review as matcher 30%, pipeline 25%, data model 20%, type safety 15%, tests 10%.
