# ADR 0004: Scoring and auto-match gates

- Status: accepted
- Date: 15 Oct 2026
- Accepted: 15 Oct 2026, with one correction the same day for a missing document date
- Question: Q-001

## Context

The assignment requires the five signals, a high threshold for auto-match, review for mid-confidence and near-ties, and a written justification. It does not fix the weights. A wrong auto-attach files the wrong VAT evidence (NFR-006).

A missing signal is left out of the mean. A missing document date does not by itself block auto-match. Low OCR confidence does. A 15% pre-VAT gap is not an auto-match.

## Decision

Accepted numbers, all in one config module:

| Knob | Value |
| --- | --- |
| Weights | amount 0.40, merchant 0.25, card 0.20, date 0.15 |
| Missing signal | Omit it, then multiply the mean by `min(1, availableWeight / 0.75)` |
| Rounding of the final confidence | 4 decimal places, before any comparison |
| Auto threshold | 0.85 |
| Review floor | 0.50 |
| Tie margin | 0.10. A smaller or equal gap goes to review |
| Also required for auto-match | Extraction confidence at least 0.60, card signal not a mismatch, top transaction not already confirmed. A missing document date does not block auto-match. A date that is present and scores 0 does. |
| Tip | Charge above the receipt by at most 20% scores 0.5, is flagged, and cannot auto-match |
| Merchant below 0.25 | Candidate excluded. A matching card does not override that |
| Pre-VAT 15% | Not in the first matcher |

The formula and worked cases are in [TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md).

### Missing document date

The first draft of this ADR said a missing date blocks auto-match, and the technical design also said to skip those candidates. Those two sentences disagreed.

The assignment makes `documentDate` nullable and says a single candidate above the high threshold is auto-matched. It does not add a missing-date veto.

Accepted rule: a missing or unreadable document date does not drop the candidate and does not by itself force review. The date signal is unavailable. With the weights above, an otherwise exact amount, merchant, and card auto-matches.

A date that is present and scores 0 still blocks auto-match. A present date that disagrees with the charge is what date proximity is for, so a zero score stays a block.

Pre-VAT is not built. The assignment does not require it.

## Alternatives

| Option | Why it is not the proposal |
| --- | --- |
| Leave a zero date score inside the mean | A stale document can still clear 0.85. |
| Punish a missing card, and auto-match a 15% pre-VAT gap | A missing card is not a mismatch. A pre-VAT gap is not proof. |
| Equal weights | Amount is the fact that is usually exact. The brief treats the others as support. |
| Auto-match every score above 0.85 with no margin | The two-branch case is exactly a high score with no winner (FR-023). |

## Consequences

Advantage: the required edges have a defined outcome. Tests can pin them. A thin document cannot look certain.

Disadvantage: the numbers are judgment. There is no labelled production set. `IMPLEMENTATION.md` must say that, and say what would be tuned later (reviewer confirm and reject rates).

Changing a weight later changes persisted confidence values. Keep the config object injectable in tests so the production numbers stay in one file.
