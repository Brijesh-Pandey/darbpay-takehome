# ADR 0005: Confirmed-match constraints

- Status: accepted
- Date: 15 Oct 2026
- Accepted: 15 Oct 2026, with the rest of the proposal
- Question: Q-003

## Context

FR-031 requires one confirmed document per transaction at the data layer. FR-028 also leaves one confirmed match on the document being confirmed. Prisma schema language cannot express a partial unique index. Both references appended SQL to the migration by hand. BetaPundit indexed the transaction only. Ashu indexed the transaction and the document.

A future statement that covers several charges (BON-003) would need the per-document index dropped. That feature is a sketch, not code.

## Decision

Accepted:

- Partial unique index on `DocumentMatch(transactionId)` where status is `CONFIRMED` or `AUTO_CONFIRMED`. This is the mechanism for FR-031.
- A second partial unique index on `DocumentMatch(documentId)` for the same statuses.
- Application code still checks and returns a typed conflict. The index is the backstop.
- The indexes are written at the bottom of the initial migration, with a comment. A test fails if they are missing.

## Alternatives

| Option | Why it is not the proposal |
| --- | --- |
| Application checks only | Two racing confirms can both pass. The brief forbids that. |
| A status column on `Transaction` such as `matchedDocumentId` | Duplicates `DocumentMatch` and drifts from the sample model. |
| Transaction index only | Allows one document to confirm two charges by mistake. Harmless for the sketch, sloppy for the exercise. |

## Consequences

Advantage: races fail closed. The per-document index matches "one receipt, one charge" for this exercise.

Disadvantage: `prisma migrate dev` may want to drop hand-written SQL. The test is the guard. BON-003's sketch must say the per-document index would be removed if statements are built.

Both indexes are in the initial migration. The per-document index is removed only if a multi-transaction statement is built later (BON-003).
