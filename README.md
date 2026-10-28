# Darb receipt and invoice matching

Drivers send receipt photos on WhatsApp. Suppliers email tax invoices. This project accepts those documents, reads them, and attaches each one to a card transaction when the match is clear. Ambiguous matches wait for a person. The mock extractor is the default. A real photo is read with Apple Vision when `EXTRACTOR=tesseract` is set on macOS.

The assignment is the source of truth: [exercise gist](https://gist.github.com/mchbeib/5901995f44d3d7d1359510bc0dd2fa4d).

## Status

Phase 8 is in the repository: the matcher, the mock extractor, both webhooks, confirm and reject, late-charge rematch, and `/review`. A live photo reader is available when `EXTRACTOR=tesseract` (ADR 0009). It uses Apple Vision. `/upload` stores a photo as email from the seeded Alfanar mailbox and shows the read (ASM-010). The mock stays the default. HMAC is still later.

| Decision | State |
| --- | --- |
| This directory is the Next.js project root | Accepted |
| Integer primary keys | Accepted |
| HMAC waits until after the review page. The live extractor reads photos with Apple Vision and is off by default | Accepted. [ADR 0002](docs/decisions/0002-defer-hmac-and-live-extractor.md), [ADR 0009](docs/decisions/0009-tesseract-extractor.md) |
| Scoring, idempotency keys, file storage, and email-sender tables | Accepted. [ADR 0003](docs/decisions/0003-idempotency-keys.md) through [ADR 0007](docs/decisions/0007-email-sender-scope.md) |

## Documentation

| Document | What it answers |
| --- | --- |
| [docs/PROJECT.md](docs/PROJECT.md) | Why the project exists, and what it will not do |
| [docs/requirements/REQUIREMENTS.md](docs/requirements/REQUIREMENTS.md) | Every requirement, with an ID |
| [docs/requirements/USER_FLOWS.md](docs/requirements/USER_FLOWS.md) | What happens on each webhook and review action |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the planned pieces fit together |
| [docs/TECHNICAL_DESIGN.md](docs/TECHNICAL_DESIGN.md) | Modules, schema, and contracts. Open items are listed at the end. |
| [docs/TEST_STRATEGY.md](docs/TEST_STRATEGY.md) | What will be tested, and how |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | The build order |
| [docs/REQUIREMENT_TRACEABILITY.md](docs/REQUIREMENT_TRACEABILITY.md) | Where each ID is specified, built, and checked |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | How to change the project once code exists |
| [docs/decisions/](docs/decisions/0001-integer-primary-keys.md) | Accepted design records, ADR 0001 through ADR 0009 |
| [docs/PHASE_1_REVIEW.md](docs/PHASE_1_REVIEW.md) | Review of the schema, seed, and tests before phase 2 |
| [AGENTS.md](AGENTS.md) | Rules an agent must follow before editing |

## Extraction and currency

A reviewer can follow this section without opening the design docs first. The records behind it are [ADR 0008](docs/decisions/0008-currency-minor-units.md) and [ADR 0009](docs/decisions/0009-tesseract-extractor.md). Root [IMPLEMENTATION.md](IMPLEMENTATION.md) is the scoring guide and the email curl.

### How a document is read

```txt
webhook or /upload -> document-ingestion -> after() -> document-processing -> extractor -> parseReceiptText -> matchDocument
```

`createDocumentExtractor` in `lib/extraction/create-extractor.ts` picks the reader from `EXTRACTOR`:

| `EXTRACTOR` | Reader | What it does |
| --- | --- | --- |
| unset, or `mock` | `MockExtractor` | Returns the synthetic fields baked into the sample webhook bytes. `npm test` and the sample curls use this. No photo engine, no key, no network. |
| `tesseract` | `TesseractExtractor` | Reads a real file, then runs the same parser. The class name is historical. Photos are Apple Vision. PDFs are the text layer. |

Anything else throws. Routes call `createDocumentExtractor()` inside the handler, so a restart picks up a changed `.env`.

`TesseractExtractor` (`lib/extraction/tesseract-extractor.ts`) asks `readDocument` for text and a confidence, then `parseReceiptText` (`lib/extraction/parse-receipt-text.ts`) fills the same Zod object the mock returns: merchant, amount in minor units, currency, date, card last four, invoice number, VAT number, and document type. `matchDocument` stays pure. It does not import Prisma, the filesystem, or the clock, and it does not know which reader produced the fields.

`readDocument` (`lib/extraction/tesseract-reader.ts`) accepts JPEG, PNG, WEBP, BMP, and PDF. An empty file or any other type becomes `UNREADABLE`, and the document ends as `FAILED`. Reads of photos are queued so two uploads do not compile or run the native reader at once.

A digital PDF is not rendered. `unpdf` reads the embedded text and stores confidence `0.59`, under the `0.60` auto-match gate, because a text layer is not an OCR score. A PDF with almost no text is `UNREADABLE`. A scanned PDF needs a photo of the page. This build does not rasterize one.

### Where Tesseract hits its limit

Tesseract.js, with the English and Arabic models, was the first live photo reader. On the station photos it did not return the VAT number, the invoice number, or, on the ADNOC slip, the payable total. Cropping the paper, grayscale, and a threshold did not recover those fields.

Those slips are the case Tesseract is weak on: a photo of thermal print, English and Arabic on the same line, a small VAT run, and a faint decimal the camera splits into a space (`800 00` for 800.00). Tesseract.js is no longer a dependency. The flag stayed `EXTRACTOR=tesseract` so a server that already had that variable did not need a new name.

### How Apple Vision is implemented

The photo path is `readImageWithVision` in `lib/extraction/vision-reader.ts`, plus `lib/extraction/vision-ocr.swift`.

1. Sharp rotates the photo from its EXIF orientation. When the bright paper is a clear subset of the frame, the dark surround is cropped. The page is enlarged to a width of 1600 when it is smaller than that. The original bytes stored on the document row are not replaced.
2. The first photo compiles `vision-ocr.swift` with `swiftc -O` into the OS temp directory (`darb-vision/vision-ocr`). A later photo reuses that binary until the Swift file is newer.
3. The Swift program loads the PNG with AppKit and runs `VNRecognizeTextRequest` at accurate level, languages `en-US` and `ar-SA`, language correction off, and no minimum text height. Words whose midlines are close are joined into a row, left to right, top to bottom. The average word confidence is printed and stored as `extractionConfidence`.
4. If the full page has no payable amount line, or the VAT number is short of 15 digits, the reader makes a closer pass over overlapping horizontal bands and keeps an amount line and a completed 15-digit VAT number from that pass. A clipped tail that is the last line of a band is dropped.
5. The parser then ranks amount lines (a VAT, tax, subtotal, tender, or change line is not the payable total), joins a labeled VAT number that wraps onto the next line only when that next line is exactly the remaining digits, and reads a spaced amount such as `800 00` as `800.00`.

Vision needs macOS and the Xcode command-line tools (`swiftc`, the Vision framework, and AppKit). A Linux host, including a typical container, cannot compile or run that binary. A photo on that host fails closed as `UNREADABLE`. PDF text extraction does not need macOS. There is no API key.

### How a reviewer turns Vision on

Leave `EXTRACTOR` unset to review the sample webhooks and the tests. Those fixtures are synthetic text declared as an image or a PDF. Vision would reject them.

On a Mac, after the setup commands below, put this in `.env` and start the app:

```bash
EXTRACTOR=tesseract npm run dev
```

A value already written in `.env` is read on the next `npm run dev`. Restart after changing it.

Open [http://localhost:3000/upload](http://localhost:3000/upload). Drop a PNG, JPEG, WEBP, or a digital PDF, or use the Harbor Coffee and Blue Bottle buttons. Those two images are `fixtures/demo/harbor-coffee-sar.png` and `fixtures/demo/blue-bottle-usd.png`. The page polls until the read is stored and shows merchant, amount, date, card, invoice, VAT number, type, and confidence.

The first photo spends a few seconds in `swiftc`. The upload copy while that runs is "Reading the page." The same bytes in the same sender scope are a duplicate and are not read again.

Files to read, in this order:

| File | What it decides |
| --- | --- |
| `lib/extraction/create-extractor.ts` | Mock versus live |
| `lib/extraction/tesseract-extractor.ts` | Live extractor class |
| `lib/extraction/tesseract-reader.ts` | Image versus PDF |
| `lib/extraction/vision-reader.ts` | Crop, compile, band pass |
| `lib/extraction/vision-ocr.swift` | Vision request and row grouping |
| `lib/extraction/parse-receipt-text.ts` | Amount, VAT, invoice, date |
| `lib/money/fx.ts` | Peg conversion used only while scoring |
| `lib/services/transaction-matcher.ts` | Gates, including the `FX` flag |
| `app/upload/upload-desk.tsx` | The page a person uses |

`npm test` stubs the reader. It does not compile Swift and does not call Vision. The suite that locks the seam is `__tests__/ingestion/ocr-extractor.test.ts`.

HMAC is still absent. Do not put `EXTRACTOR=tesseract` on a public host.

### Other OCR engines that fit this seam

A replacement implements `DocumentExtractor` or replaces `readDocument`. It returns text and a confidence. `parseReceiptText` and `matchDocument` stay. The mock must remain the default so the suite stays offline.

| Engine | What it would change |
| --- | --- |
| Tesseract.js | Already tried for photos. It missed the VAT number, the invoice number, and the ADNOC total on the station slips. It could still be a fallback on Linux, where Vision cannot run, if a later change accepts that miss. |
| PaddleOCR or EasyOCR | A local model that runs on Linux as well as macOS. No Apple framework. Not wired in. The process would sit behind `readDocument` the way the Swift binary does now. |
| Hosted document APIs (Google Cloud Vision, Amazon Textract, Azure Document Intelligence, Cloudflare Workers AI) | Useful when the host is not a Mac. Each needs an account and a secret. No account was created for this project, and `npm test` must not call them. [ADR 0002](docs/decisions/0002-defer-hmac-and-live-extractor.md) left a hosted model out of the default path. |
| A PDF rasterizer, then any of the photo readers | The missing piece for a scanned PDF. `unpdf` only sees a text layer. |

### Currency conversion

Amounts are integers in that currency's minor units (CON-006). A SAR amount is halalas, a USD amount is cents, and a BHD amount is fils. A row is not rewritten into SAR when it is stored. A blank receipt currency is treated as SAR when scoring and when the review card formats the amount. `canonicalCurrency` does not invent a code.

`lib/money/currencies.ts` holds the ISO exponent: 2 for SAR and USD, 3 for BHD, JOD, KWD, and OMR, 0 for JPY. `lib/money/fx.ts` converts only inside the score, and only when both codes have an official US dollar peg. The arithmetic is integer. The SAR peg is 1 USD = 3.75 SAR (`15/4`). The other pegs are AED, BHD, OMR, QAR, JOD, PAB, BMD, and BSD. 10000 USD cents scores as 37500 SAR halalas. EUR, GBP, and JPY have no made-up rate. They match only against the same code.

A different currency is flagged `FX` and cannot auto-match, even when the pegged amount is exact. The review card shows both amounts. A person confirms the pair. The matcher does not read the operating system's locale and does not call a live FX feed, so the same conversion runs on every host. A rate feed can replace the peg table later and still be passed in. `matchDocument` must not fetch one itself.

The Blue Bottle example on `/upload` is a USD receipt. Posting a SAR charge for the same purchase through `POST /api/transactions` is how that pair reaches Needs review. The charge has to be in the same client scope as the upload. Uploads are stored as email from `billing@alfanar-fuel.com.sa`.

## Prerequisites

Verified in this directory on 15 Oct 2026:

- Node.js v22.18.0 and npm 10.9.3
- Next.js 15.5.28, React 19.1.0, TypeScript 5.9.3
- Prisma 6.19.3 with SQLite
- Zod 3.25.76, next-safe-action 8.7.3, Jest 29.7.0

`ts-node` 10 is installed so Jest can load the assignment's `jest.config.ts`. It is not an application dependency.

## Setup

`DATABASE_URL` is `file:./dev.db`. Prisma resolves that path from `prisma/schema.prisma`, so the file is `prisma/dev.db`. Copy `.env.example` to `.env` if `.env` is missing.

These commands were run from `brijesh/` on 15 Oct 2026. `npm run dev` was not part of that run.

```bash
npm install
npx prisma migrate deploy
npx prisma db seed
npm test
npx tsc --noEmit
npm run lint
```

`npx prisma` must be run inside this directory so it uses Prisma 6. A seed prints `{"clients":2,"emailSenders":2,"transactions":15}` when the database has only the reference rows. Running it again does not remove documents. On 15 Oct 2026, `npm test` passed 16 suites and 153 tests. `tsc` and `eslint` exited 0.

On 28 Oct 2026, `npm test` passed 20 suites and 184 tests. `npx tsc --noEmit` and `npm run lint` exited 0. A separate manual Vision read of the two station photos returned the amount, date, VAT number, and invoice number. That call is not part of `npm test`. Leave `EXTRACTOR` unset for the sample webhooks. The steps for Apple Vision are in [How a reviewer turns Vision on](#how-a-reviewer-turns-vision-on).

`/upload` stores a PNG, JPEG, WEBP, or PDF as email from the seeded Alfanar mailbox (ASM-010). Real bills and the interview recording stay on the machine that made them and are not in this repository.

The email sample is `fixtures/webhooks/email-exact.json`. Start the app, then post it:

```bash
npm run dev
curl -s -X POST http://localhost:3000/api/webhooks/email \
  -H 'content-type: application/json' \
  --data-binary @fixtures/webhooks/email-exact.json
```

`npm run dev` and that curl were run in phase 4. The stored outcome is in [IMPLEMENTATION.md](IMPLEMENTATION.md). A second post of the same file returns `duplicate` and does not add a row.

The WhatsApp sample is `fixtures/webhooks/whatsapp-exact.json`:

```bash
curl -s -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H 'content-type: application/json' \
  --data-binary @fixtures/webhooks/whatsapp-exact.json
```

`npm run dev` and that curl were run in phase 5. The stored outcome is in [IMPLEMENTATION.md](IMPLEMENTATION.md). A second post returns `duplicate`.

Two more WhatsApp samples land on Needs review, because the bytes are fixtures the matcher cannot attach on its own. `fixtures/webhooks/whatsapp-albaik.json` is the two-branch Albaik receipt. `fixtures/webhooks/whatsapp-tip.json` is the Chef's Table receipt that is above the charge by a tip. Post each once:

```bash
curl -s -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H 'content-type: application/json' \
  --data-binary @fixtures/webhooks/whatsapp-albaik.json

curl -s -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H 'content-type: application/json' \
  --data-binary @fixtures/webhooks/whatsapp-tip.json
```

Refresh `/review` after the response. A second post of the same file returns `duplicate`.

Open the review desk with `npm run dev`, then visit [http://localhost:3000/review](http://localhost:3000/review). Needs review lists documents in `NEEDS_REVIEW`. Unmatched lists documents in `UNMATCHED` and does not offer confirm or reject. Confirm and reject call the existing server actions with `{ matchId }` only.

On 15 Oct 2026 the page was exercised on port 3010 against `.test-db/review-ui.db`, not `prisma/dev.db`. The queue showed three documents. Confirm on the first Albaik candidate (transaction 2) attached that receipt, disabled the other buttons while the request was in flight, and removed the document from the queue. The second document still offered transaction 2, with confirm hidden and the text "This transaction already has a confirmed document." Reject on that candidate left the document unmatched. Reject on the Chef's Table candidate (transaction 4) left the queue empty. Refresh kept the empty state. A reload showed the loading line, then the empty queue. The development database still has the phase 4 email document (`MATCHED` / `AUTO`). The phase 5 WhatsApp document is now `UNMATCHED` / `ALL_CANDIDATES_REJECTED` and appears on the Unmatched tab.
