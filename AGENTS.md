# Agent guide

This directory is the Next.js app. The assignment gist is the spec. `docs/` wins when it disagrees with `DISCOVERY.md`.

Phase 8 is done (`/review`). Do not start phase 9 (HMAC) unless the owner asks. Stop at the phase boundary.

## Read before editing

| Question | File |
| --- | --- |
| What must be built | `docs/requirements/REQUIREMENTS.md` |
| How the pieces fit | `docs/ARCHITECTURE.md` |
| Modules, schema, contracts | `docs/TECHNICAL_DESIGN.md` |
| What to build next | `docs/IMPLEMENTATION_PLAN.md` |
| Whether an ID is done | `docs/REQUIREMENT_TRACEABILITY.md` |
| Why a choice was made | `docs/decisions/` |
| How to test | `docs/TEST_STRATEGY.md` |

## Hard limits

- Do not copy source from `ashu/darb-takehome` or the sibling `darb-takehome`. Do not install, format, or commit inside those checkouts.
- Do not invent a second requirement numbering. Use `FR-`, `NFR-`, `CON-`, `BON-`, `DEV-`, `REC-`, `ASM-`, and `Q-`.
- Do not mark an ID `verified` unless the named check was run. Write the command and the result in the README.
- Do not commit `.env` or a SQLite file that holds more than the seed.
- HMAC and a live extractor wait until after the review page (ADR 0002).
