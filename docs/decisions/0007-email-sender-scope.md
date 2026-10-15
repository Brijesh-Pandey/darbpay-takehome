# ADR 0007: Email sender scope

- Status: accepted
- Date: 15 Oct 2026
- Question: review blocker B3, resolved with the accepted proposal

## Context

FR-009 says an email document may match only that client's transactions, and a WhatsApp document only that driver's. FR-014 says the seed includes a driver-phone and email mapping. The sample schema has `Transaction.clientId` and `Transaction.driverPhone`, and no table that maps an email address to a client.

The readiness review blocked phase 1 because `Client` and `ClientEmailSender` were proposed as DEV-004 and had no ADR. The owner asked to follow whichever reference is closer to the assignment.

## What the references do

Both add a client and an allowlist of email addresses. Neither can satisfy FR-009 from `clientId` alone, because an email address is not a client id.

| | Ashu | Aditya (BetaPundit) |
| --- | --- | --- |
| Tables | `Client`, `ClientEmailSender` (`ashu/darb-takehome/prisma/schema.prisma`) | `Client`, `ClientSender` (`darb-takehome/prisma/schema.prisma`) |
| Ids | Integers | Strings (cuid) |
| Email match | Lower-cased address, unique | Lower-cased address, unique |
| WhatsApp | `driverPhone` equals the sender after E.164 normalization (`lib/services/sender-scope.ts`) | `driverPhone` equals the sender inside the matcher |
| Unknown email | Document is stored and becomes `UNMATCHED` / `UNKNOWN_SENDER` (`lib/services/match-persistence.ts`) | Acknowledged and not stored (`lib/webhooks/handlers/email.ts` lines 42–47) |

## Decision

Use Ashu's shape, not Aditya's.

- `Client` and `ClientEmailSender`, integer ids, email stored lower-cased and unique.
- WhatsApp scope is `Transaction.driverPhone` after the same kind of E.164 normalization Ashu uses: strip separators, accept a leading `+`, a leading `00`, a Saudi local `05XXXXXXXX`, and a country code without a plus. The sample `966551234567` becomes `+966551234567` (ASM-007).
- An unknown email or phone is still stored. The document becomes `UNMATCHED` with reason `UNKNOWN_SENDER`. The matcher is not called.

Ashu is closer to the assignment for two reasons. Integer ids are already accepted in [ADR 0001](0001-integer-primary-keys.md), and the sample schema uses them. The assignment also says a document that fails downstream lands in `FAILED` or `UNMATCHED` rather than disappearing with the request. Dropping an unknown sender, which Aditya does to avoid unbounded storage, does not meet that sentence.

## Alternatives

| Option | Why it was not chosen |
| --- | --- |
| No client table, only `Transaction.clientId` | Nothing maps `billing@alfanar-fuel.com.sa` to a client. FR-014 has nowhere to live. |
| Aditya's `ClientSender` with string ids, unknown mail not stored | String ids contradict ADR 0001. Not storing the document contradicts the failure rule. |
| Hard-code the seed map in the service and skip a table | The mapping is data. A table is what both references used, and the seed can reload it. |

## Consequences

Phase 1 creates both tables and seeds `billing@alfanar-fuel.com.sa` on client 1 (ASM-004), plus the other mailboxes needed for two clients. Unknown senders show up as `UNMATCHED` rows. That is visible, and it is also how a bad sender can fill SQLite. A size cap on attachments is the limit in this exercise, not a drop-on-unknown rule.
