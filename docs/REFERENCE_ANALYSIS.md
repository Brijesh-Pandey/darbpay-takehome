# Reference analysis

Read-only review on 15 Oct 2026. Neither app was installed or executed. Test totals in their READMEs were not reproduced. Neither tree was modified.

The assignment remains the source of truth. These repositories show two ways to meet it. They are not a spec.

| | Ashu | BetaPundit |
| --- | --- | --- |
| Path | `ashu/darb-takehome` | `darb-takehome` (sibling of `ashu/`, not inside it) |
| Remote | `https://github.com/ashujhaji/darb-takehome.git` | `https://github.com/BetaPundit/darb-takehome.git` |
| Branch | `main`, clean | `main`, clean |
| Last commit seen | 11 Oct 2026, "Update README with project details and screenshot" | 15 Oct 2026, "IMPLEMENTATION.md: describe the current review page and shadcn components" |
| License | None | None |

Do not copy source from either tree.

## Ashu

### Structure and stack

Next.js 15.5, React 19.3, Prisma 6.19, Zod 3.25, next-safe-action 8.7, Jest 29.7, TypeScript 5 with `strict` and without `noUncheckedIndexedAccess`. SQLite. About 89 TypeScript files and 28 test files under `__tests__/`.

The layout follows the brief.

| Area | Path |
| --- | --- |
| Routes | `app/api/webhooks/email/route.ts`, `app/api/webhooks/whatsapp/route.ts`, `app/api/transactions/route.ts`, `app/review/page.tsx` |
| Matcher | `lib/services/transaction-matcher.ts`, `lib/matching/config.ts`, `signals.ts`, `merchant-normalize.ts`, `string-similarity.ts` |
| Pipeline | `lib/services/document-ingestion.ts`, `document-processing.ts`, `match-persistence.ts`, `sender-scope.ts`, `rematch.ts`, `review-decisions.ts` |
| Extract and media | `lib/extraction/*`, `lib/media/fixture-media-store.ts`, `fixtures/` |
| Data | `prisma/schema.prisma`, `prisma/migrations/20261011070210_init/migration.sql`, `prisma/seed.ts` |
| Write-up | `IMPLEMENTATION.md`, `README.md` |

`AGENTS.md` is the stock Next.js notice, not project guidance.

### What it does

- Pure `matchDocument(doc, transactions, config)`.
- Weights in `lib/matching/config.ts`: amount 0.40, merchant 0.25, card 0.20, date 0.15. Missing signals leave the average. A coverage factor (`availableWeight / 0.75`) stops a thin document from looking certain.
- Auto at 0.85, review floor 0.50, tie margin 0.10, at most 5 candidates.
- Amount outside tolerance is dropped. A merchant score under 0.25 is dropped unless the card matches exactly.
- Integer ids. Extraction stored in columns. File bytes on `Document.content`.
- Unique `externalId`. Unique `(scope, contentHash)`.
- Two partial unique indexes in the migration, one confirmed match per transaction and one per document.
- Webhook: 400 on bad input, 503 if the insert fails, 2xx if extraction or matching fails. Processing uses `after()`.
- Confirm and reject live in a service. The server action is a wrapper. Guarded updates. Concurrent decision tests exist.
- Rematch after `POST /api/transactions`.
- Eight fixture files. The bytes are placeholder text. The mock keys off the hash.
- No HMAC. No live OCR.

### Strengths

The module cut is easy to enter. The matcher signature matches the brief. Missing card digits are not treated as a mismatch. `IMPLEMENTATION.md` matches the code that was read, including the stale-date behavior it chose to keep. Failure isolation and the database constraints are real, not only described.

### Weaknesses

- A date score of 0 still sits in the weighted mean. Amount, merchant, and card at 1.0 reach 0.85, so a stale document can auto-match. The author documents this in `IMPLEMENTATION.md` and does not change it.
- The tie check subtracts raw floats.
- Because a card hit keeps a weak merchant, the ambiguous Panda fixture also surfaces a low-quality third candidate. That is a product bug relative to "two branches, send to review", even though the top two tie correctly.
- `prisma/seed-data.ts` deletes documents and matches. The README and `IMPLEMENTATION.md` disagree on whether re-seeding is safe.
- `date-fns` and `lucide-react` are dependencies without application imports. `shadcn` is a runtime dependency and is a CLI package. UI primitives use `@base-ui/react` while `@radix-ui/react-slot` is also declared.
- Review UI was not click-tested, by the author's own note. The action module is not imported from Jest.

## BetaPundit

### Structure and stack

Same major versions: Next.js 15.5.27, Prisma 6.19, Zod 3.25, Jest 29.7. TypeScript strict with `noUncheckedIndexedAccess`. About 108 TypeScript files and 42 test files. Extra dependencies include `@anthropic-ai/sdk`, `sonner`, and `next-themes`.

| Area | Path |
| --- | --- |
| Routes | `app/api/webhooks/email/route.ts`, `whatsapp/route.ts`, `transactions/route.ts`, `app/review/page.tsx` |
| HTTP | `lib/webhooks/handlers/email.ts`, `whatsapp.ts`, `transactions.ts`, `lib/webhooks/hmac.ts`, `lib/container.ts` |
| Matcher | `lib/services/transaction-matcher.ts`, `lib/config/matching.ts`, `lib/matching/signals.ts`, `normalize.ts`, `similarity.ts` |
| Pipeline | `lib/services/document-ingestion.ts`, `match-pipeline.ts`, `rematch.ts`, `blob-store.ts`, `media-store.ts` |
| Extract | `lib/extraction/types.ts`, `mock-extractor.ts`, `claude-extractor.ts` |
| Review | `lib/actions/review-core.ts`, `lib/actions/review.ts` |
| Data | `prisma/schema.prisma`, `prisma/migrations/20261013154548_init/migration.sql` |
| Write-up | `IMPLEMENTATION.md`, `README.md`, `fixtures/webhooks/`, `postman/` |

ESLint forbids the matcher files from importing Prisma, `fs`, or `path`.

### What it does

- `matchDocument({ document, sender, candidates, config })`. Scope is filtered inside the function. That is safer against a forgetful caller and is not the brief's two-argument signature.
- Weights: amount 0.45, merchant 0.25, date 0.20, card 0.10. A missing card adds 0 and is not renormalized.
- Scores rounded to 4 decimals before comparisons.
- Auto-match also requires OCR confidence at least 0.60, a readable date, a margin of at least 0.10, and a top candidate that is not already confirmed.
- A card mismatch halves the total. An amount signal below 0.05 caps the total at 0.49.
- A pre-VAT reading (invoice times 1.15) can score about 0.855 and auto-match.
- String cuid ids. Extraction is one JSON column. Unique `(source, externalMessageId, attachmentIndex)` and `(scopeKey, contentHash)`.
- One partial unique index, `one_confirmed_per_txn`.
- HMAC over the raw body with `timingSafeEqual`. Production fails closed when the secret is missing. Outside production a missing secret skips the check.
- Processing lease (`processingStartedAt`, 5 minutes) and `reprocessStale()`. Nothing calls it on a schedule.
- Competing candidate rows are withdrawn in the same transaction as a confirm.
- Unknown email senders are not stored. Unknown WhatsApp numbers are stored.
- Claude extractor is optional and, by the author's note, was not run against the live API.
- `components/ui/table.tsx` has no callers. `sonner` calls `useTheme` and the layout does not mount a theme provider.

### Strengths

The failure and race story is the most complete of the two: leases, forced interleavings, offer withdrawal, signature tests, and log redaction. Rounding before comparison removes a class of boundary bugs. The date and OCR gates stop a card hit from replacing a missing date. The SQLite `file:` URL fix in `lib/prisma-client.ts` records a real Next.js bundling bug worth remembering if `/review` returns "unable to open the database file".

### Weaknesses

- The signature and the id type depart from the brief's sketches. Both are defensible. They need a written reason, which this repo has, and they are still departures.
- Pre-VAT auto-match sits on the 0.85 line. That is a bad default for a VAT attachment.
- Token-subset merchant similarity can score 1.0 when the document name is only a generic token such as "Retail".
- `IMPLEMENTATION.md` section 3.3 calls the tip outcome reason `TIP_SUSPECTED`. The code and tests use reason `BELOW_AUTO_THRESHOLD` and flag `TIP_SUSPECTED`.
- The Claude path, Postman collection, and SSRF-hardened media client are more product than the three-hour brief asks for.
- No authentication on `/review` (stated as assumed).

## Requirement coverage

Both implement FR-001 through FR-035 and the review, rematch, and multi-invoice sketch. BetaPundit also implements BON-004 (unverified live) and BON-005.

| Topic | Assignment | Ashu | BetaPundit | Our plan |
| --- | --- | --- | --- | --- |
| Matcher signature | `matchDocument(doc, transactions)` | Matches | Object argument, scope inside | Match the brief. Scope in the service. Proposed. |
| Missing card | Strong when present | Left out of the mean | Adds 0, no renormalize | Leave it out of the mean. Proposed. |
| Stale or missing date | Date is one signal | Can still auto-match | Blocks auto-match | Block auto-match. Proposed. |
| Float boundaries | Not specified | Raw subtract | Round to 4 decimals | Round to 4 decimals. Proposed. |
| Second document on a confirmed charge | Review, do not auto-match | Does this | Does this, and withdraws other offers | Do both. Withdrawal is REC-003, proposed. |
| `contentHash` | Globally unique in the sample schema | Unique per scope | Unique per scope | Unique per scope. DEV-001, proposed. |
| Ids | Integers in the sample | Integers | Cuids | Integers. Accepted. |
| HMAC | Bonus | Absent | Present | After the review page. Accepted deferral. |
| Live OCR | Bonus | Absent | Optional, stub-tested | After the review page. Accepted deferral. |

## Ideas to rewrite, not paste

- Ashu's split between a pure matcher and small services.
- A coverage adjustment so one signal cannot look certain.
- BetaPundit's 4-decimal rounding, date gate, and OCR-confidence gate.
- Partial unique indexes because Prisma will not emit them.
- Compare-and-set on document status, plus a short lease.
- Withdraw competing candidates when one confirm wins.
- Hash the bytes we stored, not the `sha256` string in the WhatsApp payload.
- Resolve relative SQLite URLs before handing them to Prisma if the review page cannot open the file.

## Rejected approaches

| Approach | Why it is rejected |
| --- | --- |
| Copy either repository | No license. Also copies the defects above. |
| BetaPundit's full layout as the starting point | Handlers, blob store, Claude, and Postman solve problems the brief does not grade. Harder for the next reader (NFR-007). |
| Cuid primary keys | The sample action takes a number. Integers were accepted. [ADR 0001](decisions/0001-integer-primary-keys.md). |
| An LLM as the matcher | No labelled set. A VAT attachment needs a deterministic explanation. |
| Auto-match a 15% VAT difference | Too close to a wrong charge. ASM-005 keeps it as a review flag only, and only if we include it at all. |
| Global unique `contentHash` | Hides a legitimate second client. Still only a proposal: [ADR 0003](decisions/0003-idempotency-keys.md). |
| Treat a missing card as a mismatch | The brief calls last 4 a strong signal when the receipt shows it. Absence is not a conflict. |

## Differences from the assignment

Shared by both references, and still proposals for us:

- Extra `Client` and email-sender tables (DEV-004).
- Content hash unique per sender, not globally (DEV-001).
- More than one document per email message id (DEV-002).
- A hand-written partial index (DEV-003).
- An extra transaction-intake route for the rematch bonus.

BetaPundit-only departures we are not taking: string ids, extraction as unstructured JSON only, scope filtering inside `matchDocument`, HMAC and Claude in the first build.
