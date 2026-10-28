# ADR 0007: Email sender scope

- Status: accepted
- Date: 15 Oct 2026
- Question: review blocker B3, resolved with the accepted proposal

## Context

FR-009 says an email document may match only that client's transactions, and a WhatsApp document only that driver's. FR-014 says the seed includes a driver-phone and email mapping. The sample schema has `Transaction.clientId` and `Transaction.driverPhone`, and no table that maps an email address to a client.

The readiness review blocked phase 1 because `Client` and `ClientEmailSender` were proposed as DEV-004 and had no ADR. An email address is not a client id, so FR-009 cannot be satisfied from `Transaction.clientId` alone.

## Decision

- `Client` and `ClientEmailSender`, integer ids, email stored lower-cased and unique.
- WhatsApp scope is `Transaction.driverPhone` after E.164 normalization: strip separators, accept a leading `+`, a leading `00`, a Saudi local `05XXXXXXXX`, and a country code without a plus. The sample `966551234567` becomes `+966551234567` (ASM-007).
- An unknown email or phone is still stored. The document becomes `UNMATCHED` with reason `UNKNOWN_SENDER`. The matcher is not called.

Integer ids are already accepted in [ADR 0001](0001-integer-primary-keys.md), and the sample schema uses them. The assignment also says a document that fails downstream lands in `FAILED` or `UNMATCHED` rather than disappearing with the request.

## Alternatives

| Option | Why it was not chosen |
| --- | --- |
| No client table, only `Transaction.clientId` | Nothing maps `billing@alfanar-fuel.com.sa` to a client. FR-014 has nowhere to live. |
| String client ids, and dropping unknown mail | String ids contradict ADR 0001. Not storing the document contradicts the failure rule. |
| Hard-code the seed map in the service and skip a table | The mapping is data. The seed can reload a table. |

## Consequences

Phase 1 creates both tables and seeds `billing@alfanar-fuel.com.sa` on client 1 (ASM-004), plus the other mailboxes needed for two clients. Unknown senders show up as `UNMATCHED` rows. That is visible, and it is also how a bad sender can fill SQLite. A size cap on attachments is the limit in this exercise, not a drop-on-unknown rule.
