# ADR 0008: Currency minor units and pegged conversion

- Status: accepted
- Date: 27 Oct 2026
- Question: Q-006

## Context

Bills can arrive in USD while the card charge is still in SAR, and the charge feed can now store a charge in another ISO currency. Amounts are integers (CON-006). Dividing every integer by 100 displays yen and dinars incorrectly. Comparing `10000` cents with `10000` halalas treats different money as the same purchase.

## Decision

- Store each amount in its own minor units. Do not rewrite a row into SAR.
- A blank receipt currency means SAR.
- An unknown code is rejected on the charge feed and dropped by the matcher.
- The same currency uses `scoreAmount` unchanged and can auto-match.
- A different currency is converted only inside the score, and only when both codes have an official US dollar peg in `lib/money/fx.ts`. The SAR peg is 1 USD = 3.75 SAR (`15/4`).
- Conversion is integer arithmetic. The candidate is flagged `FX` and cannot auto-match.
- EUR, GBP, and JPY are not given a made-up market rate. They match only against themselves.

## Alternatives

| Option | Why it was not chosen |
| --- | --- |
| Convert every amount to SAR when it is stored | The VAT file no longer shows the bill the supplier sent. |
| Auto-match after a perfect peg conversion | The bank's spread can make a true pair look inexact, or a close pair look exact. |
| Fetch a live FX rate inside `matchDocument` | The matcher must stay free of I/O. A rate feed can replace the peg table later and still be passed in. |

## Consequences

The review card shows each amount with that currency's exponent. A 100.00 USD bill against a 375.00 SAR charge is `NEEDS_REVIEW` with amount score 1 and flag `FX`. A person confirms it.
