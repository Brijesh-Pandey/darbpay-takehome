# 60-minute walkthrough, rehearsed in 3 hours

The round is Stage 2: you run the system, defend the choices, change it live, then say what you would do with another week. They score correctness on money, time, and concurrency; structure and tests; judgement about what you cut; whether you can change your own code calmly; and honesty about gaps and AI.

| Block | Time | You do |
| --- | --- | --- |
| Demo | 10 min | Run it. Explain the shape in a few sentences. |
| Code review | 20 min | They read with you. You explain the matcher, the money rules, and the unique indexes. |
| Change request | 20 min | A small extension. Likely money: partial refunds, or multi-currency. |
| Retro | 10 min | Another week, and what you would refuse. |

## Hour 1 — say the story and the math out loud

0:00–0:20. Close the notes. Draw this from memory.

```txt
POST webhook -> Zod -> insert RECEIVED -> 200
after() -> claim EXTRACTED -> MockExtractor -> matchDocument -> one SQLite transaction
/review -> confirmMatch({ matchId }) -> confirmMatchDecision
POST /api/transactions -> insert by externalRef -> rematch UNMATCHED only
```

Say what is fake: hash-to-fixture OCR, media id to a file, reviewer id `reviewer`. Say what was cut: HMAC, live OCR, auth, a queue. The reason is the timebox. The assignment said to cut bonuses before cutting matcher edges or idempotency. ADR 0002.

0:20–0:50. Recompute these without looking. Answers are in [08-matcher-engine.md](08-matcher-engine.md).

1. Amount only, score 1. Confidence? Outcome?
2. Receipt 5750, charge 6325, other signals 1. Amount score, flag, confidence, outcome?
3. Receipt 10000, charge 9800. Outcome?
4. Receipt 10000, charge 11500. Which band, which flag?
5. Date gap of 7 days, everything else 1. Date score and does it auto-match?
6. Date gap of 8. The average is 0.85. Why is the outcome still review?
7. `2025-06-14T21:00:00.000Z` against a receipt dated 2025-06-14. Which Riyadh day, which date score?
8. Two Albaik charges. Why is the reason `AMBIGUOUS` and why is id 2 first?

Answers to check yourself:

1. 0.5333, `NEEDS_REVIEW` / `BELOW_THRESHOLD`.
2. Amount 0.5, `TIP`, confidence 0.8000, review.
3. `UNMATCHED`. The charge is lower and outside the rounding band, so it is dropped.
4. 15% is inside the 20% tip band. Flag `TIP`. No separate VAT rule.
5. Date score 0.125, confidence 0.8688, auto-match.
6. A present date of 0 is a hard block. The number would have been enough.
7. 15 Jun in Riyadh. Date score 0.875.
8. Branch numbers are stripped, so both names become `albaik`. Lead is 0. Sort is confidence, then lower id.

0:50–1:00. Open `lib/matching/signals.ts` and `lib/services/transaction-matcher.ts` and point at `scoreAmount`, `combineSignals`, and `decide` while you say the same words. If you cannot find the function in ten seconds, repeat this hour.

## Hour 2 — the three things they score as correctness

### Money

Amounts are integers. 57.50 SAR is 5750. `formatHalalas` divides by 100 on the way out. The matcher never adds VAT on top.

Say this paragraph:

"If the invoice total and the charge are both the amount the card captured, tax is already inside the integer and the score is 1. If OCR kept the pre-VAT subtotal, the charge is about 15% higher. That sits inside the 20% band, so it is flagged as a tip and a person sees it. I would not auto-match that. A charge that is lower by more than the rounding band is dropped today. I would rather show a tax-sized shortfall to a person than attach it."

Rounding band is `max(5 halalas, 1% of the receipt)`. Five halalas matters on a small receipt. On a 100 SAR receipt the band is 1 SAR.

### Time

The matcher does not call `Date.now`. The charge has `transactionAt`. The receipt has `documentDate`. Both become a Riyadh calendar day, UTC+3, no DST. Same day scores 1. Days 1 through 7 decay by `/ 8`. Day 8 scores 0 and blocks. A missing date is omitted and can still auto-match. A date we cannot parse is treated as missing.

`21:00 UTC` is the Riyadh midnight boundary. Say the two test times: 20:59 UTC stays on 14 Jun, 21:00 UTC becomes 15 Jun.

### Concurrency

Three races, three mechanisms. Do not claim a queue.

| Race | What saves you |
| --- | --- |
| Two workers extract one document | `updateMany` from `RECEIVED` to `EXTRACTED`. The loser gets count 0. |
| Two confirms, or an auto-match racing a confirm, for one charge | Partial unique index on `DocumentMatch(transactionId)` where status is `CONFIRMED` or `AUTO_CONFIRMED`. Loser rolls back. Auto-match is rewritten as review. Confirm returns `CONFLICT`. |
| Same `externalRef` posted twice | Unique column. Second call returns the existing row and does not edit it. |

The index SQL is at the bottom of `prisma/migrations/20261015113000_init/migration.sql`. It is not in `schema.prisma` because Prisma cannot express a partial index. There is a second partial index on `documentId`.

Known hole, say it before they find it: a crash after the claim and before persist leaves `EXTRACTED`. Redelivery does not schedule that row, because only `RECEIVED` is scheduled. The 5-minute reclaim exists inside `processDocument` and nobody calls it. Extraction throws are a different path: those become `FAILED`.

Tests that prove the real constraint, not a mock: concurrent confirms in the ingestion suite, and the schema test that a second confirmation is rejected. `npm test` is `jest --runInBand` because SQLite has one writer.

## Hour 3 — demo, live change, retro

### Demo script, ten minutes

Have the server command and one curl ready. Do not tour every file.

1. One sentence. "Drivers send receipt photos, suppliers email invoices, and this attaches each file to a card charge when the match is clear. Anything ambiguous waits on `/review`."
2. Shape, thirty seconds. "The route validates, stores the bytes as `RECEIVED`, and returns 200. `after()` extracts with a fixture lookup and calls `matchDocument`. The result is written in one database transaction. The HTTP body only says created or duplicate."
3. If the app is up, post `fixtures/webhooks/email-exact.json` and say what you expect before you look: client 1, transaction 1, `MATCHED`, `AUTO_CONFIRMED`, confidence 1. A second post is `duplicate`.
4. Open `/review` only if you have a Needs-review fixture loaded (`whatsapp-albaik.json` or `whatsapp-tip.json`). Point at amount, the four signals, and that the button sends `{ matchId }` only.
5. Close the demo with the cut. "The demo path is the mock, so these fixture files stay deterministic. A real photo uses Tesseract when `EXTRACTOR=tesseract`. HMAC and login are not in this build. I would add signatures before any real traffic."

If the database already has the phase 4 email on transaction 1, the WhatsApp exact photo will be `NEEDS_REVIEW` / `ALREADY_CONFIRMED`. That is the rule, not a bug. Say so before they are surprised.

### Code-review path, twenty minutes

Open in this order if they let you steer. Otherwise answer from whichever function is on screen.

| They open | You say |
| --- | --- |
| `app/api/webhooks/email/route.ts` | Validates elsewhere, schedules `processDocument` inside `after`. Scoring is not here. |
| `lib/services/document-processing.ts` | Claim, extract, load that client's charges, set `hasConfirmedDocument`, call `matchDocument`. |
| `lib/services/transaction-matcher.ts` | Walk `matchDocument`, then `decide`. |
| `lib/matching/signals.ts` | `scoreAmount` bands. Difference is charge minus receipt. |
| `lib/matching/config.ts` | Every number is here. Changing one means the tests, ADR 0004, and `IMPLEMENTATION.md` together. |
| `lib/services/match-persistence.ts` | One `$transaction`. `P2002` on auto-confirm becomes review. |
| `prisma/migrations/.../migration.sql` | The two partial indexes. |
| `lib/services/review-decisions.ts` | `updateMany` where status is `CANDIDATE`. Scope checked. Siblings rejected. |
| `lib/actions/review.ts` | `{ matchId }` only. `.inputSchema()`. `revalidatePath('/review')`. |

### Live change: partial refunds

They may say "add partial refunds." Spend the first two minutes on the rule, then the test, then the code.

Rule you should propose, and stick to unless they override it:

- A refund must not auto-attach. Same judgement as a tip.
- Today a charge below the receipt, outside rounding, is dropped, so the reviewer never sees it.
- A partial refund worth showing is a positive charge lower than the receipt by more than the rounding band and by at most the whole receipt. Flag it, score the amount at 0.5, send the document to review.
- A negative amount stays unusable. Do not invent a credit model in twenty minutes.
- Integer halalas stay.

Files:

1. `__tests__/matching/transaction-matcher.test.ts` — two tests. Receipt 10000, charge 4000, same merchant, card, and day: expect `NEEDS_REVIEW`, the new flag, amount score 0.5. Receipt 10000, charge 10005: still rounding, amount score 0.9, and with the other signals exact it still auto-matches. The existing 10000 versus 9800 case stays `UNMATCHED` unless you deliberately widen the rule.
2. `lib/matching/types.ts` — add a flag such as `PARTIAL_REFUND`.
3. `lib/matching/signals.ts` — in `scoreAmount`, after the rounding check, if `difference < 0` and `transactionAmount > 0` and the absolute gap is at most the receipt, return `{ score: 0.5, tip: false }` plus a way to signal refund. Cleaner: return a third state, or a `kind`. Do not overload `tip: true` for a refund. The reviewer reason would be wrong.
4. `lib/services/transaction-matcher.ts` — push the flag, add it to `blocked`, and put the reason after `TIP` in `reviewReason`.
5. `lib/review/format.ts` — one label, if you have five minutes. The page reads flags from stored JSON. If you skip the label, say the flag string will show raw.
6. Do not edit the route.

Run:

```bash
npx jest __tests__/matching/transaction-matcher.test.ts --runInBand
```

Talk while you type. If you get stuck, stop and say which branch you are in: "rounding must stay first, so 5 halalas does not become a refund."

If they hate the product rule, the smaller change is: keep dropping refunds, add a test that documents that, and say you would not silently attach them. Judgement counts. Flailing through FX math does not.

### Live change: multi-currency

This is already in the matcher. Same-currency pairs compare minor units and can auto-match. A blank receipt currency is SAR. USD against SAR uses the 3.75 peg in `lib/money/fx.ts`, flags `FX`, and stays in review even when the converted amount scores 1. EUR against SAR is dropped because that pair has no peg. Point at `priceInChargeCurrency` and the test `sends a dollar receipt against the pegged riyal charge to review`.

If they ask for a live market rate, keep `matchDocument` pure. Pass the rate in from the caller. Do not fetch it inside the scorer, and do not auto-match a converted amount.

### Retro, ten minutes

Another week, in the order you would actually do it:

1. On redelivery, if the row is `EXTRACTED` and the lease is older than 5 minutes, call `processDocument` again. One ingestion test. That closes the crash hole. No cron.
2. HMAC on the raw body, before Zod, both webhooks. Unsigned webhooks are the real exposure. ASM-006.
3. A `TAX_GAP` review flag for a ~15% shortfall, still unable to auto-match. Stops calling a VAT gap a tip when the card is higher, and stops hiding a shortfall.
4. Reviewer login, and put that id in `decidedBy` instead of the constant `reviewer`.
5. Arabic merchant folding, only with examples. Do not guess a normalizer in the interview.
6. Leave REC-003 unless they ask. Withdrawing other documents' candidates changes rows the reviewer has not decided. The unique index already prevents two confirmations.

What you would push back on:

- Auto-matching a tip, a 15% VAT gap, or an FX conversion.
- A global content hash. Two fleets can submit the same photo. Uniqueness is `(scope, contentHash)`.
- Extracting inside the HTTP request. The provider would retry and fight the idempotency you already have.
- Floating-point riyals.
- Turning Tesseract on for the fixture suite. The sample files are synthetic text. The mock stays the default so `npm test` never downloads a model.

### Honesty about AI

Say this in your own words, early if they ask, and in the retro if they do not:

"I used Cursor to read this repo with me and to rehearse the matcher. The behavior I am describing is what the tests and the functions do. I can open `matchDocument` and walk it. The gaps I will name are real: no HMAC, no auth, English-only OCR, and a stuck `EXTRACTED` row if we crash after the claim."

Do not claim a worker, a signature check, or a measured threshold. The weights are judgement, written down so the six required edges have a defined outcome. There is no labelled production set. Confirm and reject rates would be how you moved 0.85 later.

## One page you can glance at in the lobby

```txt
Amount 0.40  merchant 0.25  card 0.20  date 0.15
coverage floor 0.75   auto 0.85   tie <= 0.10   review floor 0.50
amount: equal=1, within max(5, 1%)=0.9, card higher by <=20%=0.5 TIP, else drop
date: Riyadh UTC+3, gap 8 scores 0 and blocks, missing date does not
blocked: TIP, CARD_MISMATCH, ALREADY_CONFIRMED, date 0, OCR < 0.60
money is halalas. scope is a filter. one confirmation is a partial unique index.
```
