# Interview prep

Study notes for the completed Darb receipt-matching take-home. Written 23 Oct 2026 by reading the assignment docs and the source. Existing project files were not edited.

These notes describe the code that is in the repository. `docs/PROJECT.md` still says the product has not started, and the layout table in root `IMPLEMENTATION.md` still says `/review` is absent. Both are stale. `README.md`, `docs/FINAL_ACCEPTANCE_AUDIT.md`, and the files under `app/review/` are the current picture: phase 8 is done.

The last recorded full check is the 15 Oct 2026 audit: `npm test` exit 0, 16 suites, 152 tests; `tsc`, `lint`, and `build` exit 0. This prep pass did not re-run that suite.

## This round: 3 hours, then a 60-minute walkthrough

The walkthrough is demo (10), code review (20), a live change such as partial refunds or multi-currency (20), and a retro (10). They score money, time, concurrency, structure, what you cut, whether you can change the code calmly, and honesty about gaps and AI.

| Hour | Read | Then do |
| --- | --- | --- |
| 1 | [08-matcher-engine.md](08-matcher-engine.md) | Recompute the eight checks at the start of [09-walkthrough-drill.md](09-walkthrough-drill.md) out loud. |
| 2 | Hour 2 in the drill | Explain money, Riyadh dates, and the three races without notes. |
| 3 | Hour 3 in the drill | Run the demo script once. Sketch the refund change on paper: test first, then `scoreAmount` and `decide`. |

The older four-hour architecture pass is still in the files below if a question leaves the matcher.

## Four-hour order

| Hour | Read | Goal |
| --- | --- | --- |
| 1 | [01-architecture-summary.md](01-architecture-summary.md) | Say what the system does, who talks to it, and how a document moves. |
| 2 | [02-codebase-map.md](02-codebase-map.md) and [03-data-model.md](03-data-model.md) | Point at the file that owns each job, and draw the tables from memory. |
| 3 | [04-lifecycles.md](04-lifecycles.md) | Walk email, WhatsApp, confirm, reject, and a late charge without notes. |
| 4 | [06-fifteen-facts.md](06-fifteen-facts.md) and [07-reviewer-questions.md](07-reviewer-questions.md) | Answer out loud. Use [05-glossary.md](05-glossary.md) when a term is fuzzy. |

## What is real, simulated, and deferred

| Kind | What |
| --- | --- |
| Implemented | Email webhook, WhatsApp webhook, shared ingestion, `after()` processing, pure `matchDocument`, confirm and reject, `/review`, late-charge rematch, SQLite partial unique indexes, seed of 2 clients and 15 charges. |
| Simulated | The default OCR is `MockExtractor`, a SHA-256 lookup of fixture files. WhatsApp media is `FixtureMediaStore`, a map from media id to a file under `fixtures/`. Fixture bytes are synthetic text, including ids declared `image/jpeg`. Reviewer identity is the constant `reviewer`. |
| Optional | `EXTRACTOR=tesseract` reads photos with Apple Vision and a digital PDF by its text layer (ADR 0009). That path is off during `npm test`. |
| Deferred | HMAC on the webhooks (BON-005, ADR 0002). Authentication (ASM-006). Arabic OCR and scanned PDFs. Multi-invoice matching is a sketch in `IMPLEMENTATION.md` only (BON-003). Competing candidates on other documents are not withdrawn (REC-003). |
| Production, if this left the exercise | Signed webhooks, a real OCR provider, reviewer auth, a queue with a durable retry for `EXTRACTED`, object storage for bytes, Postgres, and threshold tuning from confirm and reject rates. Details are in the architecture summary. |
