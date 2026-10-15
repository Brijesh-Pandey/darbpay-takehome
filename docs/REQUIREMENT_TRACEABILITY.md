# Requirement traceability

Status words are the same as in [requirements/REQUIREMENTS.md](requirements/REQUIREMENTS.md):

| Status | Meaning |
| --- | --- |
| `approved` | Accepted to build. No application code yet. |
| `proposed` | Waiting on a decision. Not a settled rule. |

A row is `verified` only where the check named in that row has been run. Everything else is `implemented`, `approved`, or `proposed`.

Specification links are the requirement rows. Design links are the planning docs.

## Must-haves

| ID | Status | Source | Spec | Module | Phase | Verification | Gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FR-001 | verified | Assignment | [REQUIREMENTS](requirements/REQUIREMENTS.md) | `app/api/webhooks/email/route.ts` | 4 | Route test and one curl, 15 Oct 2026 | — |
| FR-002 | verified | Assignment | REQUIREMENTS | `app/api/webhooks/whatsapp/route.ts` | 5 | Route test and one curl, 15 Oct 2026 | The dev database already had transaction 1 confirmed, so the curl stored `NEEDS_REVIEW` |
| FR-003 | verified | Assignment | REQUIREMENTS | Email and WhatsApp Zod schemas | 4, 5 | Email and WhatsApp 400 tests, 15 Oct 2026 | — |
| FR-004 | verified | Assignment | REQUIREMENTS | `document-ingestion.ts` | 4 | Same message twice leaves one row, 15 Oct 2026 | — |
| FR-005 | verified | Assignment | REQUIREMENTS | `document-ingestion.ts` | 4 | Same bytes, new message id, one row, 15 Oct 2026 | — |
| FR-006 | verified | Assignment | REQUIREMENTS | Email route plus `document-processing.ts` | 4 | Throwing extractor returns 200 and `FAILED`, 15 Oct 2026 | — |
| FR-007 | verified | Assignment | REQUIREMENTS | `document-processing.ts` | 4, 5 | Unknown bytes `UNMATCHED`, throwing fixture `FAILED`, email and WhatsApp, 15 Oct 2026 | — |
| FR-008 | verified | Assignment | REQUIREMENTS | `lib/media/fixture-media-store.ts`, WhatsApp route | 3, 5 | Known id, unknown id, path-like id, route returns 200 and stores nothing, 15 Oct 2026 | — |
| FR-009 | verified | Assignment | REQUIREMENTS | `sender-scope.ts`, `document-processing.ts` | 4, 5 | Email cross-client and WhatsApp other-driver tests, 15 Oct 2026 | — |
| FR-010 | verified | Assignment | REQUIREMENTS | `lib/extraction/types.ts` | 3 | Typecheck and a fake extractor, 15 Oct 2026 | — |
| FR-011 | verified | Assignment | REQUIREMENTS | `mock-extractor.ts` | 3 | Hash stability test, 15 Oct 2026 | — |
| FR-012 | verified | Assignment | REQUIREMENTS | `fixtures/documents/` | 3 | Files load in `npm test`, 15 Oct 2026 | — |
| FR-013 | verified | Assignment | REQUIREMENTS | `prisma/schema.prisma` | 1 | Schema test, 15 Oct 2026 | — |
| FR-014 | verified | Assignment | REQUIREMENTS | `prisma/seed.ts` | 1 | Seed test, 15 Oct 2026 | ASM-004 mailbox is client 1 |
| FR-015 | verified | Assignment | REQUIREMENTS | `transaction-matcher.ts` | 2 | Purity test, 15 Oct 2026 | — |
| FR-016 | verified | Assignment | [ADR 0004](decisions/0004-scoring-and-auto-match-gates.md) | `lib/matching/*` | 2 | Signal tests, 15 Oct 2026 | Scope is a filter, not a weighted signal |
| FR-017 | verified | Assignment | ADR 0004 | root `IMPLEMENTATION.md` | 2 | Guide test against `config.ts` | — |
| FR-018 | verified | Assignment | REQUIREMENTS, ADR 0004 | Matcher and `match-persistence.ts` | 2, 4 | Email fixture is `MATCHED` with one `AUTO_CONFIRMED` row, 15 Oct 2026 | — |
| FR-019 | verified | Assignment | REQUIREMENTS, ADR 0004 | Matcher | 2, 4 | Albaik email stores candidates 2 and 3, 15 Oct 2026 | — |
| FR-020 | verified | Assignment | REQUIREMENTS | Matcher | 2 | Empty and weak scores | — |
| FR-021 | verified | Assignment | REQUIREMENTS | Matcher and persistence | 2, 4 | Second photo is `NEEDS_REVIEW`; one `AUTO_CONFIRMED` remains, 15 Oct 2026 | — |
| FR-022 | verified | Assignment | REQUIREMENTS | Matcher | 2 | Exact unit test | — |
| FR-023 | verified | Assignment | REQUIREMENTS | Matcher | 2 | Albaik pair test | — |
| FR-024 | verified | Assignment | REQUIREMENTS | Matcher | 2 | 57.50 vs 63.25 | — |
| FR-025 | verified | Assignment | REQUIREMENTS | `document-ingestion.ts` | 5 | Same WhatsApp photo, new message id, one row, 15 Oct 2026 | — |
| FR-026 | verified | Assignment | REQUIREMENTS | Matcher and pipeline | 2, 4 | Email invoice with no charge is `UNMATCHED`, 15 Oct 2026 | — |
| FR-027 | verified | Assignment | REQUIREMENTS | Matcher and pipeline | 2, 4 | Unknown bytes `UNMATCHED`, unreadable scan `FAILED`, 15 Oct 2026 | — |
| FR-028 | verified | Assignment | REQUIREMENTS | `lib/services/review-decisions.ts`, `lib/actions/review.ts` | 6 | Confirm test, 15 Oct 2026 | — |
| FR-029 | verified | Assignment | REQUIREMENTS | `review-decisions.ts` | 6 | Last-reject test, 15 Oct 2026 | — |
| FR-030 | verified | Assignment | REQUIREMENTS | `review-decisions.ts` | 6 | Second confirm and second reject, 15 Oct 2026 | — |
| FR-031 | verified | Assignment | [ADR 0005](decisions/0005-confirmed-match-constraints.md) | Migration SQL, `review-decisions.ts` | 1, 6 | Index test and concurrent confirms, 15 Oct 2026 | — |
| FR-032 | verified | Assignment | [TEST_STRATEGY](TEST_STRATEGY.md) | `__tests__/matching/` | 2 | `npm test`, 15 Oct 2026 | — |
| FR-033 | verified | Assignment | TEST_STRATEGY | `__tests__/ingestion/email-webhook.test.ts`, `whatsapp-webhook.test.ts` | 4, 5 | Create, redelivery, and extraction failure on both routes, 15 Oct 2026 | — |
| FR-034 | implemented | Assignment | [README](../README.md) | README | 1, 4 | Setup commands and the email curl | The curl result is in `IMPLEMENTATION.md` |
| FR-035 | verified | Assignment | IMPLEMENTATION_PLAN phase 2 | root `IMPLEMENTATION.md` | 2 | Guide test and command log | Webhook samples are still planned |

## Non-functional and constraints

| ID | Status | Source | Spec | Module | Phase | Verification | Gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NFR-001 | verified | Assignment | REQUIREMENTS | `tsconfig.json` | 1 | `npx tsc --noEmit`, `strict` and `noUncheckedIndexedAccess` | — |
| NFR-002 | implemented | Assignment | REQUIREMENTS | Application sources | 1 onward | `npm run lint` exited 0 | Phase 1 sources contain no `any`. The Next.js ESLint config is the check. |
| NFR-003 | verified | Assignment | REQUIREMENTS | Webhook schemas, `matchIdSchema` | 4, 6 | Route tests and the match-id schema test, 15 Oct 2026 | — |
| NFR-004 | implemented | Assignment | TECHNICAL_DESIGN signals shape | `MatchCandidate.signals` | 2, 4 | Matcher returns the breakdown | Storing `DocumentMatch.signals` is phase 4 |
| NFR-005 | verified | Assignment | ARCHITECTURE error table | `document-processing.ts` | 4 | Throwing extractor returns 200, 15 Oct 2026 | — |
| NFR-006 | verified | Assignment | ADR 0004 | `config.ts`, `IMPLEMENTATION.md` | 2 | Worked examples in the guide and tests | — |
| NFR-007 | approved | Assignment | IMPLEMENTATION_PLAN | Phase order | all | Stop after phase 6 if time is short | — |
| CON-001 | implemented | Assignment | REQUIREMENTS | App Router shell | 1, 4 | `next` 15.5.28 | Webhook routes are phase 4 and 5 |
| CON-002 | verified | Assignment | REQUIREMENTS | `prisma/schema.prisma` | 1 | `migrate deploy` on SQLite, Prisma 6.19.3 | — |
| CON-003 | implemented | Assignment | REQUIREMENTS | `safe-action-client.ts` | 1, 6 | next-safe-action 8.7.3 installed | Confirm and reject actions are phase 6 |
| CON-004 | implemented | Assignment | REQUIREMENTS | Zod schemas | 1, 4 | Zod 3.25.76 installed | Boundary schemas are phase 4 |
| CON-005 | verified | Assignment | TEST_STRATEGY | `jest.config.ts` | 1 | `npm test`, Jest 29.7.0 | — |
| CON-006 | implemented | Assignment | TECHNICAL_DESIGN | Amount columns | 1, 4 | Schema `Int` and seed values | Fractional JSON rejection is phase 4 |
| CON-007 | approved | Assignment | REQUIREMENTS | Extractor types | 3 | Schema | — |
| CON-008 | verified | Assignment | REQUIREMENTS | Extractor schema | 3 | Short VAT still parses and is omitted from matcher input | Not a match signal |
| CON-009 | verified | Assignment | TECHNICAL_DESIGN tree | `lib/prisma.ts`, `utils.ts`, `logger.ts`, `safe-action-client.ts` | 1 | Files match the brief. `tsc` passed | Should, not Must |
| CON-010 | approved | Assignment | REQUIREMENTS | GitHub repo | after phase 6 | Submission checklist | Local repository exists. The GitHub remote is still required |
| CON-011 | verified | Owner, 15 Oct 2026 | PROJECT | This directory | 1 | `package.json` name `darb-takehome` | — |
| CON-012 | verified | Owner, 15 Oct 2026 | [ADR 0001](decisions/0001-integer-primary-keys.md) | Prisma ids | 1 | Schema and seed use integer ids | Action input is phase 6 |

## Bonus, deviations, recommendations

| ID | Status | Source | Spec | Module | Phase | Verification | Gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BON-001 | verified | Assignment bonus | USER_FLOWS Flow C | `app/review/page.tsx` | 8 | Browser pass on an isolated database, 15 Oct 2026 | No authentication |
| BON-002 | verified | Assignment bonus | USER_FLOWS Flow F | `lib/services/rematch.ts`, `app/api/transactions/route.ts` | 7 | Early receipt becomes `MATCHED` after the charge, 15 Oct 2026 | REC-003 is not implemented |
| BON-003 | proposed | Assignment bonus | Phase 2 task | root `IMPLEMENTATION.md` | 2 | Sketch is in the guide | Code is not built |
| BON-004 | proposed | Assignment bonus | [ADR 0002](decisions/0002-defer-hmac-and-live-extractor.md) | Second extractor | 10 | Stub test, mock stays default | Deferred on purpose |
| BON-005 | proposed | Assignment bonus | ADR 0002 | Webhook routes | 9 | Forged-signature test | Deferred on purpose |
| DEV-001 | verified | Our schema note | [ADR 0003](decisions/0003-idempotency-keys.md) | `Document` unique key | 1 | `@@unique([scope, contentHash])` in the applied migration | Two-sender insert is an ingestion test |
| DEV-002 | implemented | Our schema note | ADR 0003 | `externalId` column | 1 | Column is unique | The `#index` value is written by ingestion in phase 4 |
| DEV-003 | verified | FR-031 mechanism | [ADR 0005](decisions/0005-confirmed-match-constraints.md) | Migration SQL | 1 | Index test, second confirm fails | — |
| DEV-004 | verified | FR-009 storage | [ADR 0007](decisions/0007-email-sender-scope.md) | `Client`, `ClientEmailSender` | 1, 4 | Unknown sender stored `UNMATCHED`, 15 Oct 2026 | — |
| DEV-005 | verified | Library API | REQUIREMENTS | `lib/actions/review.ts` | 6 | `.inputSchema()` on both actions, 15 Oct 2026 | — |
| REC-001 | verified | Reference review | ADR 0004 | `config.ts` | 2 | Confidence is rounded before the 0.10 lead check | — |
| REC-002 | verified | Reference review | ADR 0004 | Matcher gates | 2 | Missing date auto-matches. A present date scoring 0 goes to review. | — |
| REC-003 | proposed | BetaPundit review | TECHNICAL_DESIGN | `match-persistence.ts` | 6 | Offer-withdrawal test | Optional inside phase 6 |
| REC-004 | approved | Reference review | [ADR 0006](decisions/0006-processing-model.md) | `document-processing.ts` | 4, 5 | Double-processor test | — |
| REC-005 | verified | Type safety | TEST_STRATEGY | `tsconfig.json` | 1 | `noUncheckedIndexedAccess` and `tsc` | — |
| REC-006 | verified | Ashu seed bug | IMPLEMENTATION_PLAN | `prisma/seed.ts` | 1 | Seed-twice test, 15 Oct 2026 | — |

## Assumptions

Assumptions are not requirements and have no implementation status. They are ASM-001 through ASM-007 in [REQUIREMENTS.md](requirements/REQUIREMENTS.md). Q-001 accepted the Riyadh calendar, the tip direction, and the rounding band as the working rules (ASM-001, ASM-002, ASM-003).

## Traceability gaps

Closed on 15 Oct 2026: Q-001 through Q-005, ADR 0003 through ADR 0007. A missing document date follows Ashu and can auto-match. Email scope follows Ashu's `Client` and `ClientEmailSender`, and an unknown sender is stored as `UNMATCHED`.

Still open:

1. The email and WhatsApp curls are documented after they were run.
2. DEV-005 is implemented with `.inputSchema()`. `/review` calls those actions.
3. FR-003 requires a useful 400 body. The exact JSON keys are not frozen.
4. REC-003 stays optional.
5. Webhooks, review decisions, the review queue, and rematch are tested on isolated databases. The browser pass used `.test-db/review-ui.db`. Competing offers on other documents are not withdrawn.
