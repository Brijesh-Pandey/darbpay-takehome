# ADR 0001: Integer primary keys

- Status: accepted
- Date: 15 Oct 2026
- Deciders: project owner

## Context

The assignment's sample schema uses `Int @id @default(autoincrement())`. The sample `confirmMatch` input is `z.number()`. One reference used integers. The other used cuid strings and changed the action to `z.string()`, so ids in URLs are not sequential.

## Decision

Primary keys on `Client`, `Transaction`, `Document`, and `DocumentMatch` are integers. `confirmMatch` and `rejectMatch` take a numeric `matchId`.

## Alternatives

| Option | Why it was not chosen |
| --- | --- |
| Cuid or UUID strings | Departs from the sample action. The exercise has no authentication (ASM-006), so hiding row counts buys little. |
| Integers in the database and strings at the action boundary | Two types for one id. |

## Consequences

Advantage: the action matches the brief. Seed data and tests can use small numbers.

Disadvantage: ids are guessable. That is acceptable only while ASM-006 holds. A later auth layer should not assume ids are capabilities.

SQLite `AUTOINCREMENT` gaps after a rolled-back insert are normal and are not a bug.
