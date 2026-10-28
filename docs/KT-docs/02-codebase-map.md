# B. Folder map

The app root is this directory. Package name is `darb-takehome`. TypeScript files are kebab-case.

## Top level

| Path | Owns |
| --- | --- |
| `app/` | Next.js App Router. Pages and route handlers. No scoring arithmetic. |
| `lib/` | Domain code: webhooks, ingestion, matching, persistence, review decisions. |
| `prisma/` | Schema, two migrations, seed. The development database is `prisma/dev.db`. |
| `fixtures/` | Synthetic document bytes, extraction JSON, `media-map.json`, sample webhook bodies. |
| `__tests__/` | Jest. Names state the situation and the outcome. |
| `docs/` | Requirements, ADRs, and design. |
| `README.md` | Setup, curls, and the review-page browser note. |
| `IMPLEMENTATION.md` | Scoring guide, assumptions, multi-invoice sketch, unfinished work. Required by the assignment. |
| `AGENTS.md` | Editing rules. Phase 8 is done. HMAC is phase 9 and was not started. |

## `app/`

| File | Responsibility | Boundary |
| --- | --- | --- |
| `app/page.tsx` | Home page. Explains the two queues and links to `/review`. It does not load documents. | UI |
| `app/layout.tsx`, `app/template.tsx`, `app/site-header.tsx` | Shell. | UI |
| `app/review/page.tsx` | Server component. `dynamic = "force-dynamic"`. Reads `searchParams.tab`. Calls `loadReviewDesk(getPrisma())`. | UI reads persistence |
| `app/review/review-board.tsx` | Client component. Tabs, notices, `useAction(confirmMatch)` and `useAction(rejectMatch)`. Submits `{ matchId }` only. | UI |
| `app/review/document-card.tsx` | Renders one document and its candidates. Buttons come from `canConfirm` / `canReject`. | UI |
| `app/review/loading.tsx`, `app/review/error.tsx` | Route loading and error UI. | UI |
| `app/api/webhooks/email/route.ts` | `POST` -> `handleEmailPost` -> `ingestEmailRequest`. `schedule` registers `after(processDocument)`. | HTTP |
| `app/api/webhooks/whatsapp/route.ts` | Same pattern, plus `FixtureMediaStore`. | HTTP |
| `app/api/transactions/route.ts` | `POST` -> `handleTransactionsPost` -> `acceptTransactions`. Rematch is synchronous. No `after()`. | HTTP |
| `app/api/uploads/route.ts` | `POST` multipart file -> email ingestion as `billing@alfanar-fuel.com.sa` (ASM-010). | HTTP |
| `app/upload/page.tsx` | Upload desk. Polls document status while Tesseract runs. Does not score or confirm. | UI |

Both webhook routes export `runtime = 'nodejs'` because they touch Prisma and the filesystem.

## `lib/services/` — the pipeline

| File | Exported entry | Does | Must not |
| --- | --- | --- | --- |
| `document-ingestion.ts` | `ingestEmailRequest`, `ingestWhatsAppRequest` | Zod is applied in the payload modules. Hash, duplicate lookup, insert `RECEIVED`, schedule ids whose status is still `RECEIVED`. | Call the matcher. |
| `document-processing.ts` | `processDocument`, `defaultProcessDeps` | Claim `RECEIVED` -> `EXTRACTED`, extract, load scope, call `matchDocument`, persist. | Render React. |
| `sender-scope.ts` | `emailScope`, `whatsappScope`, `normalizePhone`, `findEmailClient` | `EMAIL:` / `WHATSAPP:` strings. E.164. Mailbox lookup. | Score merchants. |
| `transaction-matcher.ts` | `matchDocument`, `combineSignals` | Rank and choose `AUTO_MATCHED`, `NEEDS_REVIEW`, or `UNMATCHED`. | Import Prisma, `fs`, `path`, or call `Date.now` / `Math.random`. |
| `match-persistence.ts` | `persistOutcome`, `applyRematch`, `markFailed`, `saveUnknownSender` | One database transaction for status plus match rows. | Speak HTTP. |
| `review-decisions.ts` | `confirmMatchDecision`, `rejectMatchDecision`, `REVIEWER_ID` | Guarded updates inside `$transaction`. | Know the scoring formula. |
| `rematch.ts` | `acceptTransactions`, `rematchForCharges` | Insert a charge by `externalRef`, then rematch usable `UNMATCHED` documents from saved fields. | Re-extract bytes. |

## `lib/matching/` — pure scoring

| File | Role |
| --- | --- |
| `config.ts` | `defaultMatchConfig`. Every weight and threshold. |
| `types.ts` | `ExtractedFields`, `CandidateTransaction`, `MatchScope`, `MatchResult`, flags, reasons. |
| `signals.ts` | `scoreAmount`, `scoreMerchant`, `scoreCard`, `scoreDate`. Riyadh day math lives here. |
| `normalize.ts` | `normalizeMerchant`. Latin tokens. Drops city and legal noise. `st` becomes `station`. |
| `similarity.ts` | `merchantSimilarity`. Max of token Jaccard and character-bigram Dice. |
| `round.ts` | `round4`, used before a confidence is compared. |

`__tests__/matching/purity.test.ts` reads these files plus `transaction-matcher.ts` and fails if they import Prisma, `fs`, or `path`, or mention `Date.now` or `Math.random`. The matcher suite does not open a database.

## `lib/extraction/` and `lib/media/`

| File | Role |
| --- | --- |
| `extraction/types.ts` | `DocumentExtractor`, `ExtractedDocument`, `ExtractionError`, `UNKNOWN_EXTRACTION`. |
| `extraction/mock-extractor.ts` | `MockExtractor`. SHA-256 of the bytes selects the fixture. MIME type is not the key. Unknown bytes return `UNKNOWN`. The `unreadable-scan` fixture throws `UNREADABLE`. This is the default. |
| `extraction/tesseract-extractor.ts` | `TesseractExtractor`. Used only when `EXTRACTOR=tesseract`. Photos go to Apple Vision. |
| `extraction/parse-receipt-text.ts` | Turns OCR or PDF text into `ExtractedDocument`. |
| `extraction/create-extractor.ts` | `createDocumentExtractor`. |
| `extraction/schema.ts` | `parseExtractedDocument`. Zod. A bad fixture throws `INVALID_OUTPUT`. |
| `extraction/to-fields.ts` | `toExtractedFields`. Drops VAT, invoice number, and `rawText` before matching. |
| `extraction/fixtures.ts`, `hash.ts` | Catalog load and SHA-256. |
| `media/types.ts` | `MediaStore.get(mediaId) -> { bytes, mimeType }`. |
| `media/fixture-media-store.ts` | `FixtureMediaStore`. The media id is a map key, never a filesystem path. |

## `lib/actions/` and `lib/review/`

| File | Role |
| --- | --- |
| `actions/safe-action-client.ts` | `actionClient`. Server errors become the string `REVIEW_FAILED`. |
| `actions/review-schema.ts` | `matchIdSchema`: `{ matchId: positive int }`, `.strict()`. |
| `actions/review.ts` | `'use server'`. `confirmMatch` and `rejectMatch`. `.inputSchema(matchIdSchema)`, then the decision functions, then `revalidatePath('/review')`. |
| `review/queue.ts` | `loadReviewQueue`, `loadReviewDesk`. One query. Does not select `content` or `rawText`. |
| `review/format.ts` | Halalas, Riyadh dates, score labels, `candidateActions`, `decisionMessage`. No Prisma. |

`lib/actions/review.ts` only wraps the service. Tests call `confirmMatchDecision` directly so they do not import the `'use server'` module.

## `lib/` edges

| File | Role |
| --- | --- |
| `prisma.ts` | `getPrisma()`, `disconnectPrisma()`. Resolves a relative `file:` URL against `prisma/`. |
| `db/sqlite-url.ts` | `resolveSqliteUrl`. |
| `logger.ts` | `log`. Webhook logs record ids and results. They do not record bytes, base64, `rawText`, or the phone number. |
| `webhooks/email-payload.ts` | Email Zod, base64 decode, 10 MiB cap, allowed media types. |
| `webhooks/whatsapp-payload.ts` | Envelope Zod. Payload `sha256` is required and then ignored. |
| `webhooks/transactions-payload.ts` | Charge Zod. Amount is a positive integer. |

## `prisma/`

| File | Role |
| --- | --- |
| `schema.prisma` | Models and enums. No partial indexes here. |
| `migrations/20261015113000_init/migration.sql` | Tables, plus the two hand-written partial unique indexes. |
| `migrations/20261015143000_transaction_external_ref/migration.sql` | `Transaction.externalRef` unique. Seeded rows have null `externalRef`. SQLite allows many nulls. |
| `seed.ts` | `seedReferenceData`. Upserts 2 clients, 2 mailboxes, 15 transactions. No `delete`. |

## `__tests__/`

| Folder | Opens SQLite? | Covers |
| --- | --- | --- |
| `__tests__/matching/` | No | `matchDocument`, normalization, purity, and that `IMPLEMENTATION.md` records the weights. |
| `__tests__/ingestion/` | Yes, one file per suite under `.test-db/` | Extractor, media store, both webhooks, review decisions, rematch. Webhook tests call the route `POST` and replace `after()` so `processDocument` finishes before the assertion. |
| `__tests__/schema/` | Yes, `.test-db/`, `prisma migrate deploy` | Migrations, partial indexes, seed does not delete documents. Must not write `prisma/dev.db`. |
| `__tests__/review/` | Queue test uses a database; format test does not | View model, and that client files do not import Prisma. |
| `__tests__/db/` | No | `resolveSqliteUrl`. |

`npm test` is `jest --runInBand`. `jest.config.ts` also sets `maxWorkers: 1`. SQLite has one writer.

## `fixtures/`

| Path | Role |
| --- | --- |
| `fixtures/documents/*.txt` | Bytes the mock hashes. Not scanned images. |
| `fixtures/extractions/*.json` | The object returned for that hash. |
| `fixtures/media-map.json` | WhatsApp media id -> file and declared MIME type. `media_4471` is the exact Alfanar fixture, declared `image/jpeg`. |
| `fixtures/webhooks/email-exact.json` | Sample email. |
| `fixtures/webhooks/whatsapp-exact.json` | Sample WhatsApp. Auto-matches transaction 1 when that charge is still open. |
| `fixtures/webhooks/whatsapp-albaik.json` | Two-branch receipt. Lands in review. |
| `fixtures/webhooks/whatsapp-tip.json` | Chef's Table. Lands in review with `TIP`. |

## Installed and unused

`date-fns`, `lucide-react`, and the shadcn widget packages are in `package.json` because the assignment setup installs them. Application code does not import them. The review page uses semantic buttons and a comparison table. The audit treats that as acceptable.

## Boundary cheat sheet

| Kind | Where |
| --- | --- |
| Pure | `lib/matching/*`, `matchDocument`, `combineSignals`, `toExtractedFields`, `normalizePhone`, `formatHalalas`, `candidateActions`. |
| HTTP | The three `app/api/**/route.ts` handlers. Zod stops untrusted JSON here and in `matchIdSchema`. |
| Ports | `DocumentExtractor`, `MediaStore`. Production code depends on the interface. `MockExtractor` and `FixtureMediaStore` are the defaults. |
| Persistence | `document-ingestion`, `match-persistence`, `review-decisions`, `rematch` writes, `loadReviewDesk`. Prisma is the only writer of `Document` and `DocumentMatch`. |
| UI | `app/page.tsx`, `app/review/*`. The page hides buttons. It does not update status itself. |
| Clock | `processDocument` receives `now`. The matcher never reads the clock. Riyadh day math uses the dates it was given. |
