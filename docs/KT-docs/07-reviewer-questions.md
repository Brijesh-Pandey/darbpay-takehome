# G. Ten reviewer questions

Answers name the code. If a follow-up asks for production, say what would change and stop. This exercise did not build that production piece.

## 1. Why is the matcher a pure function?

`matchDocument` is the graded 30%. It takes `ExtractedFields`, `CandidateTransaction[]`, `MatchScope`, and an optional `MatchConfig`. `document-processing.ts` and `rematch.ts` load rows and pass them in. `__tests__/matching/purity.test.ts` fails if the matcher files import Prisma, `fs`, or `path`, or mention `Date.now` or `Math.random`. The ingestion tests are not allowed to mock it, so a webhook test still executes the real ranking.

A matcher that queried Prisma would need a database for every edge, including "unknown document" and "two Albaik branches." Putting the formula in the route would mix HTTP with weights. The cost is that a caller can forget `hasConfirmedDocument`. Both callers set that flag from `CONFIRMED` and `AUTO_CONFIRMED` rows, and `inScope` checks the scope again inside the function.

In production I would keep the function. I would add a date window on the candidate query when the charge table grows. I would move 0.85 and 0.10 using confirm and reject rates. This repo has no labelled set, and `IMPLEMENTATION.md` says so.

## 2. Walk the exact Alfanar email.

`POST /api/webhooks/email` hits `handleEmailPost`, which calls `ingestEmailRequest`. The body is `fixtures/webhooks/email-exact.json`. Zod accepts it. `from` is lowercased. The attachment decodes to the `exact-alfanar` bytes. `externalId` is `messageId#0`. Scope is `EMAIL:billing@alfanar-fuel.com.sa`, which `findEmailClient` maps to client 1. The row is inserted `RECEIVED`. The response is `{ documents: [{ documentId, result: 'created' }] }`. `after()` runs `processDocument`.

The claim sets `EXTRACTED`. `MockExtractor` hashes the bytes and returns the fixture. `toExtractedFields` drops VAT, invoice number, and raw text. The client-1 query includes transaction 1: 12500 halalas, merchant `ALFANAR FUEL ST 04 RUH`, card `4242`, 14 Jun 2025. All four signals score 1. Outcome `AUTO_MATCHED`. `persistOutcome` writes document `MATCHED` / `AUTO`, and one `DocumentMatch` on transaction 1 with status `AUTO_CONFIRMED`, confidence 1, `decidedBy` `system`.

A second post returns `duplicate` and does not insert. If transaction 1 is already confirmed, the same bytes from WhatsApp become `NEEDS_REVIEW` / `ALREADY_CONFIRMED` instead. That is what the development database showed after the phase 4 email and the phase 5 WhatsApp curl.

## 3. Why did the two Albaik charges not auto-match?

Transactions 2 and 3 are both client 1, driver `+966551234567`, 4800 halalas, 12 Jun 2025, card `4242`, merchants `ALBAIK RUH 12` and `ALBAIK RUH 07`. The receipt cannot tell the branches apart, so the scores tie. `decide` treats a lead less than or equal to 0.10 as `AMBIGUOUS`. The sort is confidence descending, then transaction id ascending, so id 2 is listed before id 3. Both stay `CANDIDATE`. The document stays `NEEDS_REVIEW`.

Auto-matching either one would attach VAT evidence to the wrong fill. NFR-006 prefers the person. A threshold with no margin would still be wrong here, because both scores can be high.

## 4. How do you stop two documents confirming the same charge?

Three layers.

The matcher sets flag `ALREADY_CONFIRMED` when the caller says the charge already has a confirmation, and `decide` refuses auto-match.

`persistOutcome` writes the auto-confirm inside a database transaction. The partial unique index `DocumentMatch_one_confirmed_per_transaction` rejects a second `CONFIRMED` or `AUTO_CONFIRMED` row for that `transactionId`. The code catches `P2002` and writes `NEEDS_REVIEW` instead. There is a second partial index on `documentId`, so one document cannot confirm two charges either. Prisma cannot express a partial index, so the SQL is at the bottom of `prisma/migrations/20261015113000_init/migration.sql`.

`confirmMatchDecision` updates only a `CANDIDATE`, inside `$transaction`. The same index rolls the loser back. The action returns `CONFLICT`. Repeating a successful confirm returns `ALREADY_CONFIRMED` and does not insert another row.

The review page hides Confirm when that charge already has a confirmation. That is `candidateActions` in `lib/review/format.ts`. Hiding the button is not the invariant. The index is.

I would not withdraw the other documents' candidates unless someone asks for REC-003. The assignment requires the second document to go to review. It does not require deleting the other candidate. The leftover stays rejectable.

## 5. What happens if the provider delivers the same message twice, or the same photo under a new id?

`saveReceivedDocument` looks up `externalId` or `(scope, contentHash)` before insert. Either hit returns the existing id and `duplicate`. A concurrent insert that loses on `P2002` reads the winner and returns `duplicate`. Tests cover redelivery, a Saudi local number that normalizes to the same phone, and concurrent posts.

`storeDrafts` schedules processing only when the stored status is `RECEIVED`. A second delivery of a finished document does not run the matcher again.

Same bytes and a new message id are still one document for that sender, because of the scoped hash. Same bytes from another sender are a second document. That is DEV-001. A global hash would hide one fleet's file. The gist sample was globally unique. `IMPLEMENTATION.md` is supposed to mention the deviation.

## 6. Why `after()`, and what breaks if the process dies?

FR-006 says the webhook stays fast and does not return 500 because extraction failed. `handleEmailPost` and `handleWhatsAppPost` register `after(() => processDocument(...).catch(...))`. The bytes are already on `Document.content`, so the work does not depend on the request closure. Services do not call `after()`. Tests invoke `processDocument` themselves. Jest replaces `after()` so the assertion sees the finished row. A live `npm run dev` curl does not replace it.

If the process dies before the claim, the row is `RECEIVED`. The next delivery is still `RECEIVED`, so it is scheduled again.

If it dies after the claim and before `persistOutcome`, the row stays `EXTRACTED`. The next delivery is a duplicate and is not scheduled. The 5-minute reclaim inside `processDocument` never runs, because nothing calls it. That is P2-1 in `docs/FINAL_ACCEPTANCE_AUDIT.md`. I would fix it by scheduling `processDocument` again when a duplicate is `EXTRACTED` and the lease is null or older than 5 minutes. I would not add a cron for this exercise.

A thrown extractor is different. `markFailed` sets `FAILED` while the status is still `EXTRACTED`, and the HTTP response was already `200`.

In production I would replace `after()` with a queue and a visibility timeout, and store bytes in object storage. The exercise has one process and a 10 MiB cap. A queue was the alternative ADR 0006 rejected for scope, not because it is a bad production design.

## 7. A receipt arrives before its charge. Then the charge arrives. What happens?

The first match finds no in-scope candidate and stores `UNMATCHED` / `NO_CANDIDATE` with the extracted columns filled in. No `DocumentMatch` rows.

`POST /api/transactions` validates the charge, inserts it, and returns the existing row unchanged when `externalRef` repeats. `rematchForCharges` then loads `UNMATCHED` documents for that client's mailboxes or that driver's phone. It rebuilds `ExtractedFields` with `fieldsFromDocument`. It does not read `content` and does not call `MockExtractor`. Charges this document already rejected are filtered out. `applyRematch` moves the document only if it is still `UNMATCHED`.

If the new charge is an exact match and still open, the document becomes `MATCHED` with `AUTO_CONFIRMED`. If two unmatched receipts both want it, one confirmation wins and the other document becomes `NEEDS_REVIEW`. Documents already in `NEEDS_REVIEW` or `MATCHED` are left alone, so a reviewer decision is not overwritten by a late feed.

Rematch is synchronous in `acceptTransactions`. If it throws after the insert, the client sees `503` `STORE_FAILED` and the charge is already stored. The same `externalRef` can be posted again. It returns `duplicate` and rematch runs again.

## 8. What does the reviewer actually change, and what can they not change?

`/review` is a server component that calls `loadReviewDesk`. Needs review is `NEEDS_REVIEW` and has buttons. Unmatched is read-only. The query does not send file bytes to the browser. Fixture text is not rendered as an image.

The buttons call `confirmMatch` or `rejectMatch` with `{ matchId }` only. `matchIdSchema` is strict. `confirmMatchDecision` confirms that candidate, rejects the sibling candidates, and sets the document to `MATCHED` / `REVIEWER_CONFIRMED`, and only if the document is `NEEDS_REVIEW`, the match is `CANDIDATE`, and the charge is in the sender's scope. `rejectMatchDecision` rejects one candidate. The document becomes `UNMATCHED` / `ALL_CANDIDATES_REJECTED` only when no candidate remains.

The browser cannot send a desired status. A stale page that confirms a row someone else already confirmed gets `ALREADY_CONFIRMED` or `CONFLICT`, and the copy tells the reviewer to refresh. `decidedBy` is `REVIEWER_ID`, the string `reviewer`. There is no session. ASM-006. HMAC is also absent, so anyone who can reach the port can insert documents. ADR 0002 deferred both the signature and the live extractor until after this page, and phase 9 was not started.

In production the action would read the signed-in user into `decidedBy`, and the webhooks would verify HMAC on the raw body before Zod.

## 9. Why these weights, and where did you refuse the reference projects?

Amount is usually exact, so it is 0.40. The card is strong when the receipt prints it and is omitted when it does not, so a missing card is not a penalty. The date catches a stale receipt. A date that failed OCR is omitted and does not, by itself, force review. Coverage stops amount-only from crossing 0.85. The numbers live only in `defaultMatchConfig`. Changing one means changing `config.ts`, the tests, ADR 0004, and root `IMPLEMENTATION.md` together.

The references were read and not copied. One of them leaves a date score of 0 inside the average and can still auto-match, and it can keep a weak merchant when the card matches. This matcher blocks a present date of 0 and drops a merchant below 0.25. The other blocks a missing date and can auto-match a 15% pre-VAT gap. This matcher allows a missing date to auto-match when the other signals are exact, and it does not treat pre-VAT as its own rule. A 15% gap falls inside the 20% tip band and goes to review.

I would not claim the numbers are measured. I would say they pin the required edges, and that reviewer outcomes are how you would move them later.

## 10. What is deliberately unfinished, and what would you not pretend exists?

Unfinished on purpose:

- No HMAC. Routes are unsigned.
- No live OCR. `MockExtractor` is the default so `npm test` needs no key. A live class would implement `DocumentExtractor.extract` and the mock would stay the default.
- No authentication.
- No queue, cache, worker, blob store, or Postgres.
- Multi-invoice statements are a sketch in `IMPLEMENTATION.md`. One emailed statement would still be one `Document`, the result would stay `NEEDS_REVIEW`, and the per-document partial index would have to be dropped before one document could confirm several charges. The per-transaction index would stay.
- REC-003 is not implemented.
- A short VAT number is stored. The matcher never reads it. CON-008 is only partly met. The audit calls that P2-2.
- Merchant comparison is Latin. Arabic names are not folded.
- `date-fns`, `lucide-react`, and the shadcn widgets are installed and unused.
- The gist asks for a GitHub repository. The audit found this directory was not a git repository. Do not claim a submission remote you have not pushed.
- `docs/PROJECT.md` and one line in `IMPLEMENTATION.md` still say the app or `/review` is not built. The code and `README.md` disagree. Phase 8 is in the tree.

I would not describe a background worker, signed webhooks, or reviewer accounts as part of this build. The tests that exist are Jest against isolated SQLite files, plus one historical browser pass on `.test-db/review-ui.db` recorded in the README. There is no automated browser test.
