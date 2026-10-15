# Final acceptance audit

Audit date: 15 Oct 2026. Audit only. No application code, schema, migration, seed, or reference repository was changed.

The original assignment was read from [the gist](https://gist.github.com/mchbeib/5901995f44d3d7d1359510bc0dd2fa4d) (`exercise-document-ocr-matching.md`, created 2026-07-11). This audit did not invent requirements from memory.

## Executive verdict

**PASS WITH GAPS**

The graded work is in place: both webhooks, a pure matcher with the six required edges, integer halalas, database enforcement of one confirmation per transaction, confirm and reject, tests, `README.md`, and `IMPLEMENTATION.md`. The two bonuses the plan kept, `/review` and late-charge rematch, are also implemented. HMAC, a live extractor, and authentication are bonuses or unstated, and they are not treated as missing must-haves.

The gaps that keep this from a clean pass:

1. There is no git repository, so the gist's submission step is not done.
2. A document that reaches `EXTRACTED` and then fails to persist is not retried when the provider redelivers.
3. This audit did not repeat the browser pass, and it did not re-read `prisma/dev.db` rows.

No P0 correctness defect was found. A wrong auto-attachment, a duplicate document on redelivery, or a second confirmation of the same transaction is blocked by code and by tests.

## How this audit checked the work

| Check | Result |
| --- | --- |
| Gist | Fetched and read. |
| `npm test` | Exit 0. 16 suites, 152 tests. Isolated `.test-db/` files. `prisma/dev.db` was not the target. |
| `npx tsc --noEmit` | Exit 0. `strict` and `noUncheckedIndexedAccess` are on in `tsconfig.json`. |
| `npm run lint` | Exit 0. |
| `npm run build` | Exit 0. Static `/`. Dynamic `/review`, `/api/webhooks/email`, `/api/webhooks/whatsapp`, `/api/transactions`. |
| `npx prisma migrate status` | Exit 0. "Database schema is up to date!" Two migrations. This command does not rewrite rows. |
| `npx prisma db seed` | Not run. The seed function has no `delete` call. It was not executed against `prisma/dev.db` in this audit. |
| Browser | Not repeated. Starting the dev server against `prisma/dev.db` was skipped so this audit could not write the development database. The 15 Oct 2026 isolated pass is historical evidence, recorded in `README.md`. |
| `git rev-parse` | `fatal: not a git repository`. |

Application sources under `lib/` and `app/` contain no `any`. The only `any` hits in tests are Jest's `expect.any(Number)` and a test title.

## Requirement status

Status here is this audit's judgment, not the status word already written in `docs/REQUIREMENT_TRACEABILITY.md`.

### Must-haves

| ID | Status | Evidence |
| --- | --- | --- |
| FR-001 | Satisfied | `POST` in `app/api/webhooks/email/route.ts` calls `ingestEmailRequest`. Sample shape is `fixtures/webhooks/email-exact.json`. Test: `matches the seeded Alfanar invoice to transaction 1`. This audit did not repeat the curl. |
| FR-002 | Satisfied | `app/api/webhooks/whatsapp/route.ts`, `ingestWhatsAppRequest`, `FixtureMediaStore`. Test: `matches the seeded Alfanar photo to transaction 1`. The development-database curl result in `IMPLEMENTATION.md` is `NEEDS_REVIEW` because transaction 1 was already confirmed. That matches the assignment's already-confirmed rule. Not re-curled here. |
| FR-003 | Satisfied | Email and WhatsApp invalid JSON and invalid envelopes return 400 from `invalid()` in `document-ingestion.ts`. Tests: `rejects malformed JSON and stores nothing` on both routes. A well-formed WhatsApp envelope that contains a non-image, a bad phone, or an unknown media id returns 200 and stores nothing. See ambiguities. |
| FR-004 | Satisfied | `saveReceivedDocument` looks up `externalId` before insert and treats `P2002` as a duplicate. Tests: `treats a second delivery of the same message as the same document`, `treats a redelivery and a Saudi local number as the same document`, concurrent posts on both routes. |
| FR-005 | Satisfied, with an accepted deviation | Same bytes and the same sender scope return the existing row (`Document_scope_contentHash_key`). Tests: `treats the same bytes under a new message id as a duplicate for that sender`, `keeps one document when the same photo arrives under a new message id`. The gist schema marks `contentHash` globally unique. DEV-001 scopes it so two senders can submit the same file. `allows the same content hash for two scopes` covers that. |
| FR-006 | Satisfied | Extraction and matching run inside `after()`, and the callback returns the `processDocument` promise. A throwing extractor still yields 200 and `FAILED`. Test: `stores unknown bytes as UNMATCHED and a throwing fixture as FAILED`. A failed insert returns 503 `STORE_FAILED`, which is a store failure, not an extraction failure. |
| FR-007 | Satisfied for extraction | Unknown bytes become `UNMATCHED`. `ExtractionError` and invalid extractor output become `FAILED` via `markFailed`. A database error after the row is claimed can leave `EXTRACTED`. That is P2 below. |
| FR-008 | Satisfied | `lib/media/types.ts` `MediaStore`, `lib/media/fixture-media-store.ts`. Tests reject an unknown id and a path-like id. The route test stores nothing and returns 200. |
| FR-009 | Satisfied | `matchDocument` takes `MatchScope`. Email loads `clientId`. WhatsApp loads `driverPhone`. Tests: `ignores the other client twin`, `auto-matches only the driver phone`, `matches the other client twin and not transaction 1`, `matches the same bytes for the other driver`. `confirmMatchDecision` rolls back when `inScope` fails. Test: `refuses a candidate whose transaction is outside the sender scope`. |
| FR-010 | Satisfied | `DocumentExtractor` and `ExtractedDocument` in `lib/extraction/types.ts`. `accepts any DocumentExtractor, not only the mock`. |
| FR-011 | Satisfied | `MockExtractor` keys by SHA-256 of the bytes. `returns the same object for the same bytes`. |
| FR-012 | Satisfied | Thirteen files under `fixtures/documents/`, including the six edges: exact Alfanar, Albaik pair, tip, second photo, missing charge, unknown bytes, and the throwing scan. |
| FR-013 | Satisfied | Enums in `prisma/schema.prisma` match the gist. Extra columns (`scope`, `statusReason`, `content`, `externalRef`, client tables) are documented deviations. |
| FR-014 | Satisfied | `prisma/seed.ts` upserts 2 clients, 2 mailboxes, and 15 transactions, including the Albaik pair and the client-2 twin. Test: `seeds two clients, both mailboxes, and fifteen transactions`. Re-seed does not delete documents (`keeps an ingested document when reference data is seeded again`). |
| FR-015 | Satisfied | `matchDocument` in `lib/services/transaction-matcher.ts`. `matcher purity` asserts no Prisma, filesystem, clock, or random import. |
| FR-016 | Satisfied | Weights in `lib/matching/config.ts`: amount 0.40, merchant 0.25, card 0.20, date 0.15. Scope is a hard filter, not a fifth weighted signal. The breakdown still contains the four scored signals. |
| FR-017 | Satisfied | `IMPLEMENTATION.md` records the weights, the 0.85 auto threshold, and a worked table of the edges. `records the production weights and the auto-match threshold` reads that file. |
| FR-018 | Satisfied | Auto path writes `AUTO_CONFIRMED` and `MATCHED` in `writeMatches`. Email test asserts transaction 1. |
| FR-019 | Satisfied | Albaik pair stays `NEEDS_REVIEW` with transactions 2 and 3. Matcher test and email test. |
| FR-020 | Satisfied | `returns unmatched when no in-scope transaction exists`. Missing-charge email test stores no match rows. |
| FR-021 | Satisfied | `does not auto-match a second document for a transaction that is already confirmed`. Persistence rolls the unique-index failure back to `NEEDS_REVIEW` / `ALREADY_CONFIRMED`. WhatsApp test: `sends a second photo of a confirmed charge to review`. |
| FR-022 | Satisfied | Exact matcher test and extractor-to-matcher test. |
| FR-023 | Satisfied | `sends a same-day same-amount Albaik pair to review in id order`. |
| FR-024 | Satisfied | `sends the 57.50 SAR receipt against the 63.25 SAR charge to review with a tip flag`. Amount score 0.5. Not auto-matched. |
| FR-025 | Satisfied | WhatsApp same-bytes test leaves one document. |
| FR-026 | Satisfied | Missing-charge fixture stays `UNMATCHED` in the matcher test and the email route test. |
| FR-027 | Satisfied | `UNKNOWN` and a null amount return `UNMATCHED` without throwing. The throwing scan becomes `FAILED`. |
| FR-028 | Satisfied | `confirmMatch` in `lib/actions/review.ts` passes only `matchId` to `confirmMatchDecision`. Test: `confirms one candidate, rejects its sibling, and matches the document`. |
| FR-029 | Satisfied | `rejectMatchDecision`. Tests: one of two stays `NEEDS_REVIEW`; the last becomes `UNMATCHED` / `ALL_CANDIDATES_REJECTED`. |
| FR-030 | Satisfied | Second confirm is `ALREADY_CONFIRMED`. Second reject is `ALREADY_REJECTED`. Reject of a confirmation is `CONFLICT` and does not undo it. Confirm of a rejected row does not revive it. |
| FR-031 | Satisfied | Hand-written partial unique indexes at the bottom of `prisma/migrations/20261015113000_init/migration.sql`. Schema tests reject a second confirmation per transaction and per document. Concurrent tests: `lets only one of two documents confirm the same transaction`, `lets only one candidate confirm the same document`, `lets automatic and manual confirmation compete for one transaction`. |
| FR-032 | Satisfied | `__tests__/matching/transaction-matcher.test.ts` and `normalize.test.ts` (`ALFANAR FUEL ST 04 RUH` against `Alfanar Fuel Station`). `npm test` exit 0 in this audit. |
| FR-033 | Satisfied | Both webhook suites cover create, redelivery, and a terminal extraction failure. |
| FR-034 | Satisfied | `README.md` has setup, `prisma db seed`, `npm test`, and curl samples for both webhooks, plus how to open `/review`. |
| FR-035 | Satisfied | `IMPLEMENTATION.md` has the scoring design, assumptions, the multi-invoice sketch, and unfinished work. |

### Non-functional and constraints

| ID | Status | Evidence |
| --- | --- | --- |
| NFR-001 | Satisfied | `tsconfig.json` `strict: true`. `tsc` exit 0. |
| NFR-002 | Satisfied | No `any` in `lib/` or `app/`. `npm run lint` exit 0. |
| NFR-003 | Satisfied | Zod on email, WhatsApp, transactions, and `matchIdSchema`. Actions use `.inputSchema()`. |
| NFR-004 | Satisfied | `signalValue` stores `{ signals, flags }`. The review card lists each signal. |
| NFR-005 | Satisfied | `processDocument` errors are caught in the `after()` callback and logged by error name. They do not change the HTTP response. |
| NFR-006 | Satisfied | Auto-match requires 0.85, a lead above 0.10, extraction confidence at least 0.60, no card mismatch, and no tip flag. Written in `IMPLEMENTATION.md`. |
| NFR-007 | Satisfied | The must-have edges were not cut to build the bonuses. |
| CON-001 | Satisfied | Next.js 15.5.28, App Router, route handlers. |
| CON-002 | Satisfied | Prisma 6.19.3, SQLite, two applied migrations. |
| CON-003 | Satisfied | next-safe-action 8.7.3. `.inputSchema()` instead of the sample's deprecated `.schema()`. DEV-005. |
| CON-004 | Satisfied | Zod 3.25.76. |
| CON-005 | Satisfied | Jest 29.7.0, ts-jest, `node`, `@/` mapper, `__tests__/**/*.test.ts`. `maxWorkers: 1` is an extra safety pin. `npm test` is `jest --runInBand`. |
| CON-006 | Satisfied | `Transaction.amount` and `Document.totalAmount` are `Int`. `formatHalalas` uses integer division. Tests: `12500` → `SAR 125.00`, `5` → `SAR 0.05`, `12.5` → `Not extracted`. |
| CON-007 | Satisfied | Currency and ISO date are on the extractor schema. A bad currency or date fails `parseExtractedDocument`. |
| CON-008 | Partially satisfied | A present VAT number is not required to be 15 digits. `does not reject a short VAT number, and does not pass that number to the matcher`. The matcher never uses VAT. The assignment text says a VAT number, when present, is 15 digits. Short values are stored and ignored. |
| CON-009 | Satisfied, with a justified deviation | `lib/utils.ts`, `lib/logger.ts`, and `lib/actions/safe-action-client.ts` match the boilerplate. `lib/prisma.ts` exports `getPrisma()` and resolves a relative `file:` URL against `prisma/`. The sample default client would open a different file under the Next.js bundle. |
| CON-010 | Not satisfied | `brijesh/` is not a git repository. The gist requires a GitHub repository plus the README and `IMPLEMENTATION.md`. |
| CON-011 | Satisfied | `package.json` name `darb-takehome`. Project root is `brijesh/`. |
| CON-012 | Satisfied | Integer `@id @default(autoincrement())` on the models. |

### Bonuses and recommendations

| ID | Status | Evidence |
| --- | --- | --- |
| BON-001 | Satisfied | `app/review/page.tsx` loads `loadReviewQueue` (`status: 'NEEDS_REVIEW'`). `review-board.tsx` calls `confirmMatch` / `rejectMatch` with `{ matchId }` only. Buttons disable while pending. `candidateActions` hides confirm when the transaction is already confirmed and hides both actions when the match is not `CANDIDATE`. Historical browser pass, 15 Oct 2026, on `.test-db/review-ui.db`: confirm transaction 2, reject the leftover candidate, reject the tip candidate, empty queue, refresh. Not repeated in this audit. `prisma/dev.db` was not clicked. |
| BON-002 | Satisfied | `POST /api/transactions` and `rematchForCharges`. Tests: an early receipt becomes `MATCHED`; a duplicate `externalRef` does not insert again; a rejected transaction is not offered; two early receipts leave one confirmation; a concurrent confirm wins or the rematch wins, not both. |
| BON-003 | Satisfied as a sketch | `IMPLEMENTATION.md` section "Multi-invoice sketch". The gist says a sketch is enough. No code. |
| BON-004 | Not satisfied, deferred | No live extractor. `MockExtractor` remains the default. ADR 0002. The gist lists this as a bonus and says to cut bonuses before matcher edges. |
| BON-005 | Not satisfied, deferred | No HMAC on either webhook. Same bonus and ADR 0002. |
| REC-001 | Satisfied | Confidence is rounded to 4 decimal places before threshold comparisons. |
| REC-002 | Satisfied | A present date score of 0 blocks auto-match. A missing date does not. Low extraction confidence and a card mismatch block auto-match. |
| REC-003 | Not implemented, not required | Not in the gist. See the section below. |
| REC-004 | Partially satisfied | `processDocument` claims `RECEIVED` → `EXTRACTED` and can reclaim a stale `EXTRACTED` lease of 5 minutes. Redelivery schedules processing only when the stored status is still `RECEIVED` (`storeDrafts`). A stale `EXTRACTED` row is not scheduled again. |
| REC-005 | Satisfied | `noUncheckedIndexedAccess: true`. |
| REC-006 | Satisfied | Seed has no delete. Schema test keeps an extra document across a second seed. |

## Workflow notes

1. **Setup.** `npm install`, `prisma migrate deploy`, and `prisma db seed` are documented. This audit ran migrate status only. Schema is up to date. Seed was not run.
2. **Email.** Zod, sender lookup, base64 and media-type checks, 10 MiB cap, hash and message-id dedup, then `after(processDocument)`. Unknown sender is `UNMATCHED` / `UNKNOWN_SENDER` and the matcher is not called.
3. **WhatsApp.** Envelope Zod failures are 400. Per-message problems are skipped with 200. `image.id` is a fixture key, not a path. Phone normalization turns `966551234567` into `+966551234567`. The payload `sha256` is required and then ignored. Dedup uses the hash of the stored bytes.
4. **Matching.** Pure function. Riyadh calendar days (UTC+3, no DST) are an assumption, ASM-001, and are tested (`21:00 UTC` on 14 Jun is 15 Jun in Riyadh). Tip is a higher card charge of at most 20%. A charge below the receipt outside the rounding band does not match.
5. **Late charges.** `externalRef` is unique. A repeat returns the existing id and does not change the row. SQLite allows many nulls, so seeded charges stay valid. Rematch reads saved fields and only `UNMATCHED` documents in the new charge's client or driver scope.
6. **Confirm and reject.** One database transaction. Guarded `updateMany` from `CANDIDATE`. Unique-index failures roll back to `CONFLICT`. The review page does not write status itself.
7. **Review queue.** One query. It does not select file bytes or `rawText`. A `MATCHED` document for another client is absent from the payload (`lists only documents that need review and only their own candidates`). Conflict, already-confirmed, already-rejected, not-found, and `REVIEW_FAILED` each have distinct copy in `decisionMessage` / `outcomeFromAction`. Success copy is used only for `CONFIRMED` and `REJECTED`.
8. **Bad input.** Malformed JSON stores nothing. Oversized email attachments are 400. Oversized WhatsApp media is skipped. Invalid extractor output is `FAILED`.

## REC-003

The gist says a transaction that already has a `CONFIRMED` or `AUTO_CONFIRMED` document must not auto-match a second document. It must go to review. It does not say to withdraw the other document's candidate.

REC-003 is a recommendation taken from a reference project: when one document confirms a transaction, delete or reject competing `CANDIDATE` rows on other documents in the same transaction. It is `proposed` in `docs/requirements/REQUIREMENTS.md` and was left optional on purpose.

Observable consequence, and it is the current development-database story: the email document auto-confirmed transaction 1. The later WhatsApp photo of the same receipt is `NEEDS_REVIEW` with a `CANDIDATE` still pointing at transaction 1. The review page hides Confirm for that candidate and still offers Reject. Nothing is double-confirmed. The reviewer has to reject the leftover. That is the assignment's required behavior, not a hole in it.

Do not implement REC-003 unless the owner asks. It changes rows the reviewer has not decided.

## Other deferred items

| Item | Assignment status | Judgment |
| --- | --- | --- |
| Authentication | Not in the gist. The evaluation criteria do not mention it. | Acceptable. ASM-006. `decidedBy` is `reviewer`. |
| HMAC | Bonus. The time note says to cut bonuses before idempotency. | Acceptable deferral. ADR 0002. Unsigned webhooks are stated in the README. |
| Live extractor | Bonus. The mock must stay runnable without keys. | Acceptable deferral. The interface is in place. |
| Shadcn `button`, `badge`, `table`, `tabs`, `tooltip` | The setup script installs them. The evaluation criteria do not grade their presence. | Acceptable. The review page uses semantic buttons and a comparison table. The project's own requirements say every installed widget need not be used. |
| Multi-invoice code | Sketch is enough. | Done as a sketch. |

No other must-have from the gist was found incomplete, apart from the GitHub repository.

## Findings

### P0

None.

### P1

**P1-1. The project cannot be submitted as the gist asks, because it is not a git repository.**

Impact: the submission section requires a GitHub repository link. The matcher and the pipeline are unaffected.

Evidence: `git rev-parse` from `brijesh/` exits with `fatal: not a git repository`. `README.md` says this on purpose. The parent directory must not be initialized.

Proposed fix, after approval: `git init` inside `brijesh/` only, then create the GitHub repository the owner chooses. Do not initialize the parent folder. Do not commit `.env` or `prisma/dev.db`.

### P2

**P2-1. Redelivery does not resume a document stuck in `EXTRACTED`.**

Impact: if the process crashes after the claim and before `persistOutcome`, the HTTP response was already 200. A later delivery of the same message finds the row and does not call `processDocument`, because `storeDrafts` schedules only `RECEIVED`. The reclaim branch inside `processDocument` never runs. The row stays `EXTRACTED`, which is not the `FAILED` or `UNMATCHED` state the gist asks for after a downstream failure. Extraction failures that throw are handled and become `FAILED`. This gap is the crash between claim and persist.

Evidence: `storeDrafts` in `lib/services/document-ingestion.ts`. Claim and reclaim in `processDocument` in `lib/services/document-processing.ts`.

Proposed fix, after approval: when a duplicate row is `EXTRACTED` and `processingStartedAt` is null or older than 5 minutes, schedule `processDocument` again. Do not add a cron. Add one ingestion test on an isolated database.

**P2-2. A short VAT number is stored.**

Impact: low. The matcher ignores VAT. The assignment's extractor comment says a VAT number, when present, is 15 digits. The schema accepts other digit lengths.

Evidence: `does not reject a short VAT number` in `__tests__/ingestion/extractor.test.ts`.

Proposed fix, after approval: only if a reviewer treats CON-008 as strict. Reject a non-empty VAT that is not 15 digits at the extractor schema. Do not start using VAT as a match signal.

**P2-3. Traceability still describes finished work as unfinished.**

Impact: a reader of `docs/REQUIREMENT_TRACEABILITY.md` can think webhook samples are still planned (FR-035 gap) and that the `#index` external id is still future work (DEV-002 gap). The code and `IMPLEMENTATION.md` disagree with those cells.

Proposed fix, after approval: edit those gap cells. Do not change requirement meaning.

## Missing or weak tests

- No automated browser test. Jest does not render the page. The queue test checks the view model and that the client files do not import Prisma. The conflict, already-confirmed, and failure messages are unit-tested. A click that receives `CONFLICT` from a stale page was not part of the historical browser pass, because the page hid the second confirm after refresh.
- No test that a redelivered message resumes a stale `EXTRACTED` row. That behavior does not exist yet.
- This audit did not repeat the email or WhatsApp curls, and it did not open `/` or `/review` against `prisma/dev.db`.
- Live HMAC and live OCR have no tests because they are not built.

The matcher, idempotency, concurrency, and rematch tests are the strong part of the suite. They use real SQLite writes, not mocked constraints.

## Acceptable limitations

- REC-003 is unimplemented. The second document stays in review. The unique indexes still prevent two confirmations.
- HMAC, a live extractor, and authentication are outside the must-have scope.
- Unknown WhatsApp media returns 200 and stores nothing. A `FAILED` row would need bytes, and an empty placeholder would collide on the content hash. A provider that treats 200 as success will not retry that message.
- A crash before the claim leaves `RECEIVED`. The same message, posted again, is scheduled again.
- Fixture files are synthetic text, including ids declared as `image/jpeg`. The review page says no preview is shown.
- Same file bytes from two senders create two documents. That is DEV-001, and it is the right reading of sender scope.
- Dates use Asia/Riyadh. The gist does not name a timezone.
- A 15% VAT gap is scored as a tip, not as its own rule.
- Merchant comparison is Latin text.
- `lib/prisma.ts` is not the sample default export.

## Unresolved ambiguities in the gist

- Whether "the same file content must not create a duplicate" forbids the same bytes from a second sender, or only forbids provider redelivery. This project chose per-sender uniqueness and documented it.
- Whether one bad message inside a valid WhatsApp envelope must fail the whole request with 400. This project returns 200 and omits that message. A bad envelope is 400.
- Whether an unknown media id must become a `FAILED` document. This project does not store it.
- Whether sender scope is a weighted signal or a filter. This project filters first, then scores amount, merchant, card, and date.
- Which timezone "same day" uses. This project uses Asia/Riyadh, UTC+3, no daylight saving.
- Whether a tip may be a charge below the receipt. This project treats that, outside the rounding band, as a non-match.
- The exact JSON keys of a 400 body. The implementation uses `error` and `issues`.
- The sample action uses `.schema()`. Version 8.7.3 wants `.inputSchema()`. The behavior is the same: `{ matchId }` only.

## Remediation plan

Do none of this until the owner approves it.

Mandatory before calling the submission complete:

1. Create a git repository in `brijesh/` only, and publish it the way the gist describes. Leave `prisma/dev.db` and `.env` untracked.

Optional, in this order:

1. Resume a stale `EXTRACTED` document when the same message is delivered again. One isolated test.
2. Correct the stale gap text in `docs/REQUIREMENT_TRACEABILITY.md`.
3. Tighten VAT length only if CON-008 must be literal.
4. Leave REC-003, HMAC, the live extractor, authentication, and shadcn widgets alone unless a reviewer asks for them.

## Files changed by this audit

- `docs/FINAL_ACCEPTANCE_AUDIT.md` (this file)
