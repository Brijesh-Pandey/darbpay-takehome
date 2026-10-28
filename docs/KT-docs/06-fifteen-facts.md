# F. Fifteen facts to say without the code

1. The business outcome is one receipt or tax invoice attached to one card charge, automatically when the match is clear, and by a person when it is not. A wrong auto-attachment is treated as worse than an extra review.

2. There are four inbound actors and no driver UI: email webhook, WhatsApp webhook, `POST /api/transactions`, and `/review`. The match result is stored in SQLite. It is not returned in the webhook body.

3. `matchDocument` in `lib/services/transaction-matcher.ts` is pure. It does not import Prisma, read files, or call `Date.now` or `Math.random`. The caller passes extracted fields, already-loaded transactions, and a scope. A purity test reads the source.

4. Scoring weights are amount 0.40, merchant 0.25, card 0.20, date 0.15. Auto-match needs at least 0.85 and a lead greater than 0.10. Review keeps scores at or above 0.50, at most five, lower transaction id first on a tie. Missing signals are omitted, then the mean is multiplied by `min(1, availableWeight / 0.75)`. Confidence is rounded to 4 decimal places before it is compared.

5. Scope is a filter, not a fifth weight. Email sees one `clientId`. WhatsApp sees one E.164 `driverPhone`. Client 2's twin of the Alfanar charge never receives a partial score when the document belongs to client 1.

6. A present date that scores 0 blocks auto-match. A missing date does not. Day 8 and later scores 0. Days are Asia/Riyadh, UTC+3, no daylight saving. `21:00 UTC` on 14 Jun 2025 is the next calendar day in Riyadh.

7. A tip is a charge above the receipt by at most 20%. It scores 0.5, sets flag `TIP`, and cannot auto-match. The 57.50 versus 63.25 case is that rule. A charge below the receipt, outside the rounding band, is dropped. A 15% gap is scored as a tip. There is no VAT-gap rule.

8. Amounts are integer halalas. Transaction 1 is `12500`. The review page formats that as `SAR 125.00` by integer division. The matcher never uses floating SAR.

9. Document statuses are `RECEIVED`, `EXTRACTED`, `MATCHED`, `NEEDS_REVIEW`, `UNMATCHED`, `FAILED`. Match statuses are `CANDIDATE`, `AUTO_CONFIRMED`, `CONFIRMED`, `REJECTED`. `AUTO_MATCHED` is only a matcher outcome. `EXTRACTED` means the row is claimed, not that OCR has been saved.

10. Idempotency uses two keys. `externalId` is unique: `messageId#attachmentIndex` for email, the message id for WhatsApp. `(scope, contentHash)` is unique per sender. The same photo from two senders is two documents. The WhatsApp payload hash is ignored. The stored hash is SHA-256 of the bytes we kept.

11. Webhooks insert `RECEIVED`, return `200`, and process in `after()`. A throwing extractor still returns `200` and the row becomes `FAILED`. Unknown OCR becomes `UNMATCHED`. An unknown sender is stored as `UNMATCHED` / `UNKNOWN_SENDER` and the matcher is not called. A duplicate whose status is no longer `RECEIVED` is not scheduled again.

12. One confirmation per transaction and one confirmation per document are partial unique indexes in the initial migration, not in `schema.prisma`. A second auto-confirm loses the race, rolls back, and is saved as `NEEDS_REVIEW`. Confirm and reject use `updateMany` from `CANDIDATE` inside one database transaction. The page submits `{ matchId }` only.

13. A new charge is idempotent on `externalRef` and does not change an existing row. Rematch reruns only `UNMATCHED` documents in that client or driver scope, from columns already stored. It skips previously rejected transaction ids. `MATCHED`, `NEEDS_REVIEW`, `FAILED`, and `RECEIVED` are not reopened. Rematch runs inside the charge request. It does not use `after()`.

14. The default OCR and the WhatsApp media store are fakes. `MockExtractor` looks up a fixture by SHA-256. `FixtureMediaStore` looks up `image.id` in `fixtures/media-map.json`. The files are synthetic text. `EXTRACTOR=tesseract` switches on Apple Vision for real photos (ADR 0009). HMAC and authentication are not built. Reviewer identity is the constant `reviewer`.

15. The known gap to defend, not hide: if the process dies after the claim and before persist, the row stays `EXTRACTED`. A redelivery finds the duplicate and does not call `processDocument`, so the 5-minute reclaim never runs. Extraction throws are handled and become `FAILED`. Competing candidates on other documents are not withdrawn. The unique index still prevents two confirmations, and the review page can reject the leftover.
