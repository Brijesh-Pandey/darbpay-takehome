# ADR 0002: HMAC and a live extractor wait

- Status: accepted
- Date: 15 Oct 2026
- Deciders: project owner

## Context

The assignment lists webhook HMAC (BON-005) and a real extractor behind the same interface (BON-004) as bonuses. It also says to cut bonuses before cutting matcher edges or idempotency. The BetaPundit reference implements both. Its Claude path was not verified against the live API. The owner confirmed these two wait until after the review page.

## Decision

The first build through the review page uses the mock extractor and unsigned webhooks. HMAC and a live extractor are later phases. The mock remains the default if a live extractor is added, so the project still runs without keys.

## Alternatives

| Option | Why it was not chosen |
| --- | --- |
| HMAC in the first webhook phase | Delays the graded idempotency and matcher work. |
| Live OCR in the first extractor phase | Needs a key, a network, and an unverified prompt. Reviewers could not run it as the default. |
| Drop both bonuses | The owner deferred them. They stay on the plan after the page. |

## Consequences

Advantage: the must-haves stay small (NFR-007). The extractor interface still has a seam (FR-010).

Disadvantage: until HMAC exists, anyone who can reach the port can insert documents. That matches ASM-006 and must be stated in the README when the server actually starts.

The review page phase is BON-001, which is still `proposed`. This ADR says HMAC follows that page. If BON-001 is dropped, HMAC still waits until the must-have pipeline is done, and this record should be updated.
