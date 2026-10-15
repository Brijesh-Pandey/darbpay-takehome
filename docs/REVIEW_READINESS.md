# Pre-development readiness review

Update, 15 Oct 2026: the owner accepted the proposal and asked for two review blockers to follow the closer reference. ADR 0003 through ADR 0007 are now accepted. A missing document date follows Ashu (the candidate stays and can auto-match). Email scope follows Ashu (`Client`, `ClientEmailSender`, unknown sender stored as `UNMATCHED`). H7 is closed by root `AGENTS.md`. The findings below are the review as first written. B1, B2, and B3 are closed by those records. The other gaps were not part of that correction.

Reviewer stance: this pass did not treat the planning set as correct because it exists. The assignment gist `5901995f44d3d7d1359510bc0dd2fa4d` is the source of truth. Reference files were opened again for the claims this review relies on. Neither reference was modified or executed. No application code was written. No other planning file was edited.

Date: 15 Oct 2026.

The owner said the written proposal looked fine in chat, after these documents were frozen. That sentence is not recorded in any ADR. This review judges the repository as it sits.

## 1. Overall readiness

The must-have assignment surface is documented, separated from bonuses, and pointed at tests. The module split is small enough to build. The repository is not ready to code from.

Two independent problems:

- The plan tells the implementer to stop. ADR 0003, ADR 0004, ADR 0005, and ADR 0006 are still `proposed`. [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) refuses phase 1 and phase 2 until those questions are accepted inside the docs.
- One matcher rule contradicts another in the same section of [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md). A literal reading drops missing-date documents out of review. The worked example says the opposite.

There is no `AGENTS.md` under `brijesh/`. Nothing in the repo is loaded automatically to stop an agent from drifting.

**Recommendation: no-go for implementation.** A short documentation correction is the next step, not phase 1.

## 2. Critical blockers

### B1. The repo still says the design is unaccepted

Evidence: [decisions/0003-idempotency-keys.md](decisions/0003-idempotency-keys.md), [0004](decisions/0004-scoring-and-auto-match-gates.md), [0005](decisions/0005-confirmed-match-constraints.md), and [0006](decisions/0006-processing-model.md) all say `Status: proposed`. [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) line 3 and the phase 1 and phase 2 prerequisites say not to start until Q-002, Q-003, Q-004, and Q-001 are accepted. [README.md](../README.md) still lists scoring, idempotency keys, and file storage as proposed.

The chat approval is invisible to the next session. An implementer who follows the plan will either stop or silently treat proposals as decisions. Both are failures of the spec.

This blocks phase 1.

### B2. Missing date is both "skip the candidate" and "send to review"

Evidence, [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md):

- Step 2: "Skip a candidate with a different currency, a non-finite amount, or an unreadable date."
- The auto-match row and the worked table: a missing date stays on the shortlist and becomes `NEEDS_REVIEW` ("Exact everything except a missing date").

If "unreadable date" means the document date, every candidate is removed and the outcome is `UNMATCHED`, because nothing is left to score. That contradicts the worked table and the gate "date score exists and is not 0", which only makes sense if the candidate is still ranked.

If it means a corrupt `transactionAt` only, the worked table survives, but the sentence does not say that.

This blocks phase 2. The six required edges use readable dates, so it does not by itself fail FR-022 through FR-024. It does make the design's own date gate unimplementable without a guess.

### B3. Email scoping has no accepted place to live

FR-009 requires an email document to match only that client's transactions. FR-014 requires a driver-phone and email mapping in the seed. The sample schema has `clientId` on `Transaction` and no sender table.

[TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md) adds `Client` and `ClientEmailSender` as DEV-004 and says they are proposed. There is no ADR. [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) says phase 1 applies only deviation ADRs that were accepted. A strict reading omits the mapping table and then cannot implement FR-009.

This blocks the phase 1 schema.

## 3. High-priority gaps

### H1. A merchant below 0.25 is discarded even when the card matches

[TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md) step 3 and [ADR 0004](decisions/0004-scoring-and-auto-match-gates.md). The assignment calls card last 4 a strong signal when the receipt shows it (FR-016). This rule deletes the candidate before that signal can put the row on the review list.

Ashu kept the candidate when the card matched (`lib/services/transaction-matcher.ts` excludes weak merchants only when the card is not an exact match). That choice produced a noisy third candidate on their ambiguous fixture, which is why this plan rejected it. The rejection also hides a true charge whose OCR merchant is badly read and whose amount, date, and card are exact. The reviewer never sees it. It becomes `UNMATCHED`.

Confirm or replace this rule in the correction pass. A safer replacement: hard-exclude on merchant only when the card is missing or mismatched; when the card matches, keep the row and force review.

### H2. The date curve is not a function

The date row says "same day = 1, decreasing to 0 at 8 days." It does not say what day 1 through day 7 score. [TEST_STRATEGY.md](TEST_STRATEGY.md) lists gaps of 7 and 8 days as boundaries and does not give expected numbers.

The required fixtures are same-day, so FR-022 through FR-024 do not depend on the slope. Any later "documents arrive days late" case does. Two implementers will pick different slopes. Write the formula, for example Ashu's `1 - dayGap / 8` for a gap of 0 through 7 and 0 after that (`ashu/darb-takehome/lib/matching/signals.ts` lines 48–51), or an explicit table.

### H3. "May auto-match" is not an acceptance test

The worked row "Exact amount and merchant, no card, same day | May auto-match" cannot fail a test. Under the stated weights the result is determined:

- Available weight = 0.40 + 0.25 + 0.15 = 0.80, coverage = 1, confidence = 1.00.
- Card is absent, not a mismatch. The gate "card signal is not 0" passes.
- Date is present. OCR confidence is assumed to be at least 0.60.

That row should say `AUTO_MATCHED`, and the fixture's `extractionConfidence` should be required to be at least 0.60. The mock's default for a known fixture is not stated.

### H4. Pre-VAT is still optional inside an otherwise numeric spec

[ADR 0004](decisions/0004-scoring-and-auto-match-gates.md) says a 15% gap is an optional flag and may be omitted. [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md) says the choice is open inside Q-001. The assignment does not require it. BetaPundit's version can auto-match (`darb-takehome/lib/matching/signals.ts` lines 45–50, consumed by the auto-match condition in `lib/services/transaction-matcher.ts` around line 156). Leave pre-VAT out of the first matcher. Add it later only as a review flag.

### H5. Confirm and reject are described as a bonus in the charter

[PROJECT.md](PROJECT.md) consumers table: "Ops reviewer | Confirms or rejects candidates | Planned bonus". FR-028 and FR-029 are Must. The page is the bonus (BON-001). [ARCHITECTURE.md](ARCHITECTURE.md) draws this distinction. The charter does not. A reader who stops at the charter will schedule the actions with the page and can cut them under NFR-007. That would drop a graded requirement.

### H6. Crash recovery contradicts itself

[ADR 0006](decisions/0006-processing-model.md) claims the row from `RECEIVED` to `EXTRACTED` before work finishes, and also says a redelivery reschedules only a row still in `RECEIVED`. [ARCHITECTURE.md](ARCHITECTURE.md) error table: "Process dies after the response | The row stays `RECEIVED`."

If the claim runs first, a crash leaves `EXTRACTED`, redelivery does not retry, and the lease has no query written down (which status, which age). The assignment does not require crash recovery. The design should not claim a lease it does not specify. Pick one story: either stay `RECEIVED` until success, with the claim stored in `processingStartedAt`, or document the reclaim predicate for `EXTRACTED`.

### H7. No enforceable AI or contributor rule file

`brijesh/` has no `AGENTS.md`. [CONTRIBUTING.md](CONTRIBUTING.md) is the workflow, and an agent session does not load it unless told. Ashu's `AGENTS.md` is only the stock Next.js block, so there is no project convention to preserve.

Before phase 1, add a short rule file that says: assignment IDs are the spec, do not edit the two reference repos, do not copy their source, matcher code does not import Prisma or the filesystem, do not install packages until the phase allows it, and a behavior change updates the requirement status only after a test runs.

### H8. FR-003's "useful body" is not what the tests lock

The assignment requires 400 with a useful body. [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md) proposes a JSON shape and then tells tests to assert status and "no second row", not the body, until the shape is accepted. [TEST_STRATEGY.md](TEST_STRATEGY.md) follows that. FR-003 can pass on status alone and still return an empty 400. The correction should make the 400 body part of the phase 4 test: a path and a message, no need for a large error framework.

## 4. Lower-priority improvements

| Item | Evidence | Why it can wait |
| --- | --- | --- |
| ERD omits required extraction columns | [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md) diagram versus the sentence "the brief's extraction columns stay". `rawText`, `vatNumber`, `decidedBy`, and `decidedAt` are in the assignment schema and not in the picture. | The prose names the columns. Fix the diagram in the correction so it is not the only picture an implementer copies. |
| Unknown WhatsApp media has two outcomes | [USER_FLOWS.md](requirements/USER_FLOWS.md) Flow B: store `FAILED`, or skip with 2xx. | Either meets FR-006 and FR-008. Pick one when the WhatsApp route is specified. Prefer store `FAILED` so the miss is visible. |
| Phone formats beyond the sample | ASM-007 specifies `966551234567` to `+966551234567`. Other shapes (`05…`, `00…`) are not listed. | The sample payload is the graded one. Extra formats can follow a failing fixture. |
| 10 MiB attachment cap | [ADR 0006](decisions/0006-processing-model.md). Not in the assignment. | Useful, not graded. Keep it, label it as a local limit. |
| No auth | ASM-006. Both references do the same. | Correct for this exercise. README must repeat it when the server exists. |
| `DISCOVERY.md` still has a second roadmap and the original four questions | Sections 7 and 8, including "approve step 1" and a different phase split (both webhooks in one step). The banner says `docs/` wins. | Do not maintain two plans. Point section 8 at [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) during the correction. |
| Shadcn file list | Phase 1's file list does not name `components.json` or the five UI components the setup script installs. | `create-next-app` and `shadcn init` produce them. Check the versions after install. Do not add UI work in phase 1. |
| REC-003 offer withdrawal | Optional inside phase 6. | FR-031 is met by the transaction index without it. Keep it optional. |

## 5. Requirement traceability gaps

[REQUIREMENT_TRACEABILITY.md](REQUIREMENT_TRACEABILITY.md) covers FR-001 through FR-035, NFR-001 through NFR-007, CON-001 through CON-012, the bonuses, and the deviations. Nothing is `verified`. That is accurate.

| Gap | IDs | What is wrong |
| --- | --- | --- |
| Spec status lags the owner's chat approval | Q-001 through Q-005, ADR 0003–0006, DEV-001 through DEV-003, REC-001, REC-002, REC-004 | Traceability still says the numeric spec and the keys are blocked. The chat is not a file. |
| No ADR, so no trace row that can flip to accepted | DEV-004 | Client and email-sender tables are required by the design and absent from `docs/decisions/`. |
| Acceptance text is not pass/fail | Worked row "May auto-match"; date gaps of 7 and 8 days; pre-VAT "may be omitted" | A test cannot be written yet. See H2, H3, H4. |
| FR-028 is Must and the charter calls the actor a bonus | FR-028, FR-029, BON-001 | Traceability is right. [PROJECT.md](PROJECT.md) is wrong. |
| FR-003 body | FR-003 | Verification column says route tests. The test strategy allows those tests to ignore the body. |
| FR-034, FR-035 | README, root `IMPLEMENTATION.md` | Correctly not met. Do not mark them done in the correction. |
| Reference test totals | [REFERENCE_ANALYSIS.md](REFERENCE_ANALYSIS.md) | 1140 and 884 were never run here. The analysis already says so. Do not promote those numbers into a gate. |

No assignment Must was found missing from the inventory. Bonuses are marked `proposed` in the requirements file. They are not silently upgraded to Must, except for the charter slip in H5.

## 6. Documentation contradictions

| Topic | File A | File B |
| --- | --- | --- |
| Missing date | TECHNICAL_DESIGN step 2 skips the candidate | TECHNICAL_DESIGN worked table sends it to review |
| After a crash | ARCHITECTURE: row stays `RECEIVED` | ADR 0006: claim moves it to `EXTRACTED` before the work finishes |
| `noUncheckedIndexedAccess` | IMPLEMENTATION_PLAN phase 1 turns it on | CONTRIBUTING and traceability: REC-005 is still proposed |
| Confirm/reject | REQUIREMENTS FR-028 Must; ARCHITECTURE agrees | PROJECT consumers table: bonus |
| Phase order | IMPLEMENTATION_PLAN: email milestone, then WhatsApp | DISCOVERY roadmap: both webhooks together, then confirm, and it still asks for step-1 approval |
| Indexes | ADR 0005: the transaction index stays even if Q-003 is rejected | IMPLEMENTATION_PLAN phase 1 tests: "both indexes exist if accepted", which can be read as neither |
| Schema picture | Prose: assignment extraction columns stay | ERD: those columns are absent |
| Design approval | Chat: proposal seems fine | README and ADR 0003–0006: proposed |

## 7. Recommended corrections

Do these in the planning files only. Do not start the app in the same change.

1. Record the chat approval. Set ADR 0003, 0004, 0005, and 0006 to `accepted`, with one sentence that pre-VAT is **not** accepted and will not be built in the first matcher (H4). Update the README status table and the traceability blockers.
2. Rewrite TECHNICAL_DESIGN step 2 so a missing document date does not drop candidates. Skip only a corrupt transaction timestamp, a non-finite amount, or a different currency. Keep the worked row as `NEEDS_REVIEW`.
3. Add ADR 0007 for `Client` and `ClientEmailSender`, status accepted, as the storage for FR-009 and FR-014. State that `Transaction.clientId` alone cannot name an email sender.
4. Replace the merchant hard-exclude so a matching card cannot disappear (H1), unless the owner explicitly keeps the current rule in that ADR edit.
5. Write the date function as a table or a formula (H2). Change "May auto-match" to `AUTO_MATCHED` and require extraction confidence of at least 0.60 on that fixture (H3).
6. Fix the PROJECT consumers row so the server actions are Must and only `/review` is BON-001 (H5).
7. Pick the crash story in ADR 0006 and make ARCHITECTURE match it (H6). Drop the lease if the reclaim query is not going to be specified.
8. Make the phase 4 test require a 400 body with a field path (H8).
9. Add `AGENTS.md` with the prohibitions in H7. Do not claim tooling commands have been run.
10. Replace DISCOVERY section 8 with a pointer to the implementation plan so the old phase list cannot be followed.

After that correction is reviewed, phase 1 is a reasonable start.

## 8. Go / no-go

**No-go for implementation.**

The assignment's mandatory behavior is identified. Both references were inspected, and the reuse choices are argued rather than copied. The planned first milestone, phase 4 (one seeded email fixture becomes a single `MATCHED` document, a bad body returns 400, a repeat does not insert another row), is the right smallest end-to-end slice. Phases 2 and 3 belong in front of it because they are pure and fixture work.

The repository, read cold, forbids that work and contains one matcher contradiction that a careful implementer cannot resolve locally. Fix the planning package as in section 7. Wait for review of that correction. Then phase 1 may install dependencies and add the schema.

## Appendix: what was checked in source

| Claim in the planning docs | Checked |
| --- | --- |
| Ashu's seed deletes documents | `ashu/darb-takehome/prisma/seed-data.ts` lines 47–54 delete matches, documents, transactions, senders, and clients |
| A date score of 0 still enters Ashu's weighted mean | `lib/matching/signals.ts` lines 50–51 return `0` past the window, not null. The matcher copies non-null date scores into the mean |
| BetaPundit can treat a pre-VAT total as the better amount | `darb-takehome/lib/matching/signals.ts` lines 45–50 |
| BetaPundit will not auto-match a missing date | `lib/services/transaction-matcher.ts` lines 156–157 require `!dateMissing` |
| Neither reference has a license file | No `LICENSE` in either tree (previous inventory, not re-copied) |
| No project AI rules in `brijesh/` | Glob of `brijesh/` is the planning markdown only |

Reference test counts were not re-run. Runtime behavior of either app was not executed.
