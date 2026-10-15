# Test strategy

Matcher tests, the schema suite, and the extractor tests exist. `npm test` is `jest --runInBand` (CON-005). The commands that were run are listed in the root [IMPLEMENTATION.md](../IMPLEMENTATION.md).

## Philosophy

Test the behavior a wrong VAT attachment or a lost webhook would hit. Do not chase a coverage percentage. The matcher is pure and carries the highest grade weight, so most cases live there as plain objects. The database is used where a constraint or a duplicate key is the thing under test.

A test name states the situation and the outcome: `second whatsapp photo with the same bytes keeps a single document`.

## Layers

| Layer | What it proves | Database | When |
| --- | --- | --- | --- |
| Unit | Signals, normalization, `matchDocument` outcomes, extractor hash lookup | No | Phases 2 and 3 |
| Service | Ingestion, persistence, confirm, reject, rematch, scope queries | Yes, SQLite file per run | Phases 1, 4, 5, 6 |
| Route | HTTP status for 400, 2xx, and duplicate delivery. The route calls the real ingestion service or a thin fake only at the `after()` boundary | Yes when the test hits ingestion | Phases 4 and 5 |
| Contract | Zod schemas accept the assignment's sample payloads and reject the broken ones | No | Phase 4 |
| Browser | Confirm, reject, empty queue, and a second confirm that is not offered on `/review` | Yes, isolated dev server | Phase 8, manual, 15 Oct 2026 |

There is no hosted end-to-end suite and no Playwright plan. The review page was checked once in the browser on 15 Oct 2026. The clicks are in the root [README.md](../README.md). Queue formatting and the `NEEDS_REVIEW` query are also covered by Jest.

There is no separate contract test against Meta or an email vendor. The contract is the sample JSON in the assignment.

## Layout and naming

Planned, matching the sample Jest config:

```
__tests__/matching/*.test.ts
__tests__/ingestion/*.test.ts
```

File names match the module: `transaction-matcher.test.ts`, `webhooks.test.ts`. Helpers that build a document or a transaction live in `__tests__/helpers/` and contain no assertions.

`matchDocument` tests take a config argument so a boundary can be set without editing production numbers. The default config in those tests is the production config, so a silent edit to a weight fails the worked examples.

## Fixtures

Twelve synthetic text files live under `fixtures/documents/`, with extraction JSON under `fixtures/extractions/` and `fixtures/media-map.json` (FR-012). The bytes are not scanned images. The mock keys off the SHA-256 of those bytes, not the filename.

| Fixture intent | Requirement |
| --- | --- |
| Exact amount, merchant, date, card | FR-022 |
| Two same-day branches | FR-023 |
| 57.50 versus 63.25 | FR-024 |
| Same bytes as the exact photo, sent again | FR-025 |
| Usable invoice with no seeded charge | FR-026 |
| `UNKNOWN`, null amount | FR-027 |
| Extractor throws | FR-007 |
| Second photo, different bytes, charge already confirmed | FR-021 |

The seed that these fixtures assume is fixed data, not random. Re-running the seed must not delete documents (REC-006). The phase 1 test inserts a document, seeds again, and checks that the row is still there.

## Mocking

| Boundary | In unit tests | In service tests |
| --- | --- | --- |
| Matcher | Real | Real |
| Extractor | Fake that returns a chosen object, plus the real mock for hash tests | Real mock, and one test injects a throwing extractor |
| Media store | Not used | Real fixture store, plus one unknown id |
| Prisma | Not used | Real SQLite |
| Clock and `Math.random` | Forbidden inside the matcher. A purity test fails if the matcher module calls them | — |
| `after()` | Not used | The route test invokes the processing function itself, or records the callback. Tests do not depend on Next scheduling the callback |

Do not mock the matcher in ingestion tests. A bug in the wiring would pass.

## Cases by kind

| Kind | Where it shows up |
| --- | --- |
| Positive | Exact auto-match. Valid webhook creates one row. Confirm moves the document to `MATCHED`. |
| Negative | Unknown sender. Other client's twin. Malformed JSON. Bad base64. `UNKNOWN` extraction. |
| Boundary | Confidence exactly 0.85. Margin exactly 0.10. Rounding band of 5 halalas. Date gap of 7 days and of 8 days. Empty candidate list. |
| Failure | Extractor throw. Insert conflict under two concurrent deliveries. Two confirms of one transaction. Worker crash simulated by leaving `RECEIVED` and processing again. |
| Regression | The worked table in ADR 0004, once accepted, is a permanent test table. A change to a weight updates the table in the same change. |

Concurrent cases use a forced interleaving or a real unique-index collision. They do not hope that `Promise.all` hits the race.

## Coverage expectations

No global percentage gate. Jest's coverage report is optional and is not a merge check.

Required before a phase is called done:

- Every acceptance line for the IDs in that phase has a test or a documented manual check. See [REQUIREMENT_TRACEABILITY.md](REQUIREMENT_TRACEABILITY.md).
- The matcher file has direct tests for FR-022 through FR-027 before any review UI work.
- The partial unique indexes have a test that the index exists and that a second confirm fails. That test is `__tests__/schema/reference-data.test.ts`.

`no any` (NFR-002) is a lint or review check, not a coverage check.

## Checks before merging

Run from `brijesh/` after `npm install`. These were run on 15 Oct 2026.

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | Exit 0 in phase 7 |
| Lint | `npm run lint` | Exit 0 in phase 7 |
| Tests | `npm test` | 14 suites, 139 tests, exit 0 in phase 7 |

One Jest worker is the default (`--runInBand` in the test script) because SQLite has one writer. Do not add `--watch` to the script used in review.

## How to run them

The schema test creates `.test-db/reference-data.db`, sets `DATABASE_URL` to that file, runs `prisma migrate deploy`, and deletes the file in `afterAll`. It does not use `prisma/dev.db`.

```bash
npm test
npx tsc --noEmit
npm run lint
```
