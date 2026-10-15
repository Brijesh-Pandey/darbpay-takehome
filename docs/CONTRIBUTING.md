# Contributing

Phase 1 is in the tree. Commands below that say they were run were executed on 15 Oct 2026. Later phases stay planned until their commands have been run. Do not leave a planned command looking like a verified one.

The assignment is the spec. [requirements/REQUIREMENTS.md](requirements/REQUIREMENTS.md) has the IDs. [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) has the phase gates.

## Setup

Ran from `brijesh/` with Node.js v22.18.0:

```bash
npm install
npx prisma migrate deploy
npx prisma db seed
npm test
npx tsc --noEmit
npm run lint
```

`DATABASE_URL="file:./dev.db"` in `.env`. The SQLite file is `prisma/dev.db`. The seed printed `{"clients":2,"emailSenders":2,"transactions":15}` on the first run and on the second. `npm test` printed 6 passed. `tsc` and `eslint` exited 0.

Do not copy `package.json` or source from `ashu/darb-takehome` or the sibling `darb-takehome`.

Reference checkouts are read-only. Do not install, format, or commit inside them.

## Code organization

Planned layout: [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md).

| Rule | Why |
| --- | --- |
| Routes validate and delegate | Scoring does not live in a route file |
| `matchDocument` stays pure | FR-015. No Prisma, no `fs`, no clock |
| One config module for weights and thresholds | A test and `IMPLEMENTATION.md` can point at one place |
| Review decisions live outside the `'use server'` file | That file should export only the actions |
| Amounts are integer halalas | CON-006 |

## Naming

- Requirement IDs stay `FR-`, `NFR-`, `CON-`, `BON-`, `DEV-`, `REC-`, `ASM-`, `Q-`. Do not invent a second numbering.
- Document and match statuses use the assignment enums, uppercase.
- TypeScript files are kebab-case, matching the paths in the design.
- Tests end in `.test.ts` and live under `__tests__/`, which is what the sample Jest config collects (CON-005).
- A test name states the situation and the outcome.

## Tests, lint, and format

See [TEST_STRATEGY.md](TEST_STRATEGY.md). These were run on 15 Oct 2026: `npm test` (6 passed), `npx tsc --noEmit` (exit 0), `npm run lint` (exit 0, ESLint from the Next.js 15 setup).

Formatting is whatever that ESLint setup enforces. Prettier is not part of the assignment and is not adopted. Do not add it in passing.

`npm test` is `jest --runInBand`. One worker is the default because SQLite has a single writer. The schema suite passed that way.

`no any` (NFR-002). `strict` and `noUncheckedIndexedAccess` (REC-005, accepted).

A matcher change updates the worked examples in root `IMPLEMENTATION.md` in the same change (FR-017).

## Branches and pull requests

This directory is the git repository. There is no remote yet.

- `main` stays runnable at a phase boundary.
- One phase per branch: `phase/<n>-<short-name>`.
- The pull request names the requirement IDs and the phase's done line from the implementation plan.
- The description says which commands were run. "Not run" is acceptable only for a docs-only change.
- Do not commit `.env` or a SQLite file that contains more than the seed.

No remote exists. Do not push until CON-010 is in progress and the owner names the GitHub repository.

## Documentation

| Change | Also update |
| --- | --- |
| A new behavior | The requirement ID, or a new ID if the assignment did not cover it |
| A scoring number | ADR 0004's status, `config.ts`, tests, and root `IMPLEMENTATION.md` |
| A schema deviation | The ADR and DEV-00x row |
| A command that was run | README and this file, removing the "planned" label |
| A phase finished | [REQUIREMENT_TRACEABILITY.md](REQUIREMENT_TRACEABILITY.md) status moves to `implemented` only when the code is present, and to `verified` only when the check has been run |

Do not mark a requirement `verified` because the code looks right.

## Definition of done

A phase is done when all of these are true:

- Its acceptance lines in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) are met.
- Its tests have been executed, or the plan called the check manual and that pass is written down.
- New assumptions are in the requirements file, not only in a code comment.
- Proposed ADRs the phase needed are `accepted` or the phase used the ADR's documented fallback.
- Reference repositories are unchanged.
- The README does not describe a command that nobody has run.

Documentation-only changes are done when the linked pages agree and no ID was left without a verification column.
