# E. Glossary

Terms as this repository uses them.

| Term | Meaning |
| --- | --- |
| Halala | Minor unit of SAR. 187.50 SAR is stored as `18750`. One SAR is 100 halalas. |
| Document | One received file. An email attachment or a WhatsApp image. Table `Document`. |
| Transaction | One card charge. Table `Transaction`. Not a database transaction. The code uses `$transaction` for the latter. |
| Candidate | A charge the matcher still considers, or the stored `DocumentMatch` row a reviewer can see. |
| Signal | One scored fact: `amount`, `merchant`, `cardLast4`, or `date`. |
| Confidence | The combined score from 0 to 1, rounded to 4 decimal places before it is compared. Stored on `DocumentMatch.confidence`. |
| Flag | A hard mark on a candidate: `TIP`, `CARD_MISMATCH`, or `ALREADY_CONFIRMED`. Flags can block auto-match without removing the candidate. |
| Scope | The only charges a document may see. Also the dedup prefix on `Document.scope`. |
| `MatchScope` | The matcher input: `{ kind: 'EMAIL', clientId }` or `{ kind: 'WHATSAPP', driverPhone }`. |
| Sender scope string | `EMAIL:<lowercase address>` or `WHATSAPP:<E.164>`. Paired with `contentHash` for uniqueness. |
| `externalId` | Provider identity. Email: `messageId#attachmentIndex`. WhatsApp: message id. Globally unique. |
| `contentHash` | SHA-256 of the bytes that were stored. The WhatsApp payload `sha256` is not this value. |
| `externalRef` | The card feed's id for a charge. Unique when present. Seeded charges leave it null. |
| Auto-match | Matcher outcome `AUTO_MATCHED`. Persistence writes document `MATCHED` and match `AUTO_CONFIRMED` with `decidedBy` `system`. |
| Review | Document `NEEDS_REVIEW`. Match rows are `CANDIDATE` until a person decides. |
| Claim | Compare-and-set from `RECEIVED` to `EXTRACTED` so two workers do not extract the same row. |
| Lease | `processingStartedAt`. A claim older than 5 minutes can be taken again, if `processDocument` is called. |
| `after()` | Next.js hook. The webhook registers work that runs after the response is sent. |
| Port | An interface with a fake behind it: `DocumentExtractor`, `MediaStore`. |
| Fixture | A file under `fixtures/documents/` whose hash the mock recognizes. The bytes are synthetic text. |
| `MockExtractor` | `extract(file, mimeType)` returns the fixture for that hash, or `UNKNOWN`, or throws. |
| `FixtureMediaStore` | Maps a WhatsApp `image.id` to a fixture file. The id is not a path. |
| `decidedBy` | `system` for auto-confirm. `reviewer` for a person. There is no user table. |
| Partial unique index | A unique index with a `WHERE` clause. Here it covers only `CONFIRMED` and `AUTO_CONFIRMED`. |
| `P2002` | Prisma's unique-constraint error. Ingestion treats it as a duplicate. Decisions and auto-confirm treat it as `CONFLICT` or as a fall back to review. |
| Coverage | `min(1, availableWeight / 0.75)`. Stops a thin set of signals from scoring like a full match. |
| Tie margin | `0.10`. A lead less than or equal to this is `AMBIGUOUS` and stays in review. |
| Review floor | `0.50`. Candidates below it are dropped. At most 5 remain. |
| Tip band | Charge minus receipt is positive and at most 20% of the receipt. Score 0.5. Cannot auto-match. |
| Rounding band | The larger of 5 halalas and 1% of the document amount. Score 0.9. Not a tip. Checked first. |
| Riyadh day | Calendar date in UTC+3 with no daylight saving. Used for the date signal and for the review page. |
| Rematch | Re-run `matchDocument` for `UNMATCHED` documents after a new charge is stored, using fields already on the row. |
| Unknown sender | A stored document the system will not score: `UNMATCHED` / `UNKNOWN_SENDER`. |
| DEV-001 | `contentHash` is unique per scope, not globally. |
| DEV-002 | Email `externalId` includes the attachment index. |
| DEV-003 | The two partial indexes are hand-written SQL. |
| DEV-004 | `Client` and `ClientEmailSender` are not in the gist sample schema. |
| DEV-005 | Server actions call `.inputSchema()`, not the sample's `.schema()`. |
| REC-003 | Optional idea: when one document confirms a charge, reject other documents' candidates for that charge. Not built. |
| ASM-006 | No authentication on webhooks or `/review` in this exercise. |

## Status words that are easy to mix up

| Word | Lives on |
| --- | --- |
| `AUTO_MATCHED` | Matcher result only. Never stored as `Document.status`. |
| `AUTO_CONFIRMED` | `DocumentMatch.status`. The system attached it. |
| `CONFIRMED` | `DocumentMatch.status`. A person attached it. |
| `MATCHED` | `Document.status`. Either path has attached the file. |
| `CANDIDATE` | `DocumentMatch.status`. Still open. |
| `NEEDS_REVIEW` | `Document.status`. A person must look. |
| `EXTRACTED` | `Document.status`. Processing has claimed the row. Fields may not be saved yet. |
| `created` / `duplicate` | HTTP result for a document or a charge. Not a status enum. |
