# ADR 0004: Scoring and auto-match gates

- Status: accepted
- Date: 15 Oct 2026
- Accepted: 15 Oct 2026, with one correction the same day for a missing document date
- Question: Q-001

## Context

The assignment requires the five signals, a high threshold for auto-match, review for mid-confidence and near-ties, and a written justification. It does not fix the weights. A wrong auto-attach files the wrong VAT evidence (NFR-006).

Ashu renormalizes missing signals and can still auto-match when the date score is 0. BetaPundit blocks a missing date and low OCR confidence, rounds to 4 decimals, and can auto-match a 15% pre-VAT gap. This ADR takes the first habit and the second project's gates, and rejects pre-VAT auto-match.

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

The first draft of this ADR said a missing date blocks auto-match, and the technical design also said to skip those candidates. Those two sentences disagreed. The owner asked to follow whichever reference is closer to the assignment.

| Implementation | What it does | Where |
| --- | --- | --- |
| Ashu | `scoreDate` returns null when `documentDate` is missing. The candidate stays. The date is left out of the mean. There is no extra veto. | `ashu/darb-takehome/lib/matching/signals.ts` lines 42–46, used from `lib/services/transaction-matcher.ts` |
| Aditya (BetaPundit) | A missing date scores 0.5, is flagged `DATE_MISSING`, and auto-match is refused, so the document goes to review if it still clears the floor. | `darb-takehome/lib/matching/signals.ts` lines 60–62 and `lib/services/transaction-matcher.ts` lines 152–168 |

The assignment makes `documentDate` nullable and says a single candidate above the high threshold is auto-matched. It does not add a missing-date veto. Ashu follows that. Aditya's veto is a safer extra rule, not the requirement.

Accepted rule: a missing or unreadable document date does not drop the candidate and does not by itself force review. The date signal is unavailable. With the weights above, an otherwise exact amount, merchant, and card auto-matches.

A date that is present and scores 0 still blocks auto-match. That is not Ashu. Ashu's own notes say a date score of 0 can still reach 0.85 and auto-match, and they left that in on purpose. Using a present date that disagrees with the charge is what "date proximity" means, so a zero score stays a block. Aditya gets the same practical result for a far date because a zero date pulls his total under 0.85.

Pre-VAT is not built. The assignment does not require it, and Aditya's version can auto-match a 15% gap.

## Alternatives

| Option | Why it is not the proposal |
| --- | --- |
| Ashu's formula unchanged | Stale documents can auto-match. A weak merchant survives on a card hit. |
| BetaPundit's weights unchanged | A missing card is punished. Pre-VAT can auto-match at about 0.855. |
| Equal weights | Amount is the fact that is usually exact. The brief treats the others as support. |
| Auto-match every score above 0.85 with no margin | The two-branch case is exactly a high score with no winner (FR-023). |

## Consequences

Advantage: the required edges have a defined outcome. Tests can pin them. A thin document cannot look certain.

Disadvantage: the numbers are judgment. There is no labelled production set. `IMPLEMENTATION.md` must say that, and say what would be tuned later (reviewer confirm and reject rates).

Changing a weight later changes persisted confidence values. Keep the config object injectable in tests so the production numbers stay in one file.
