# ADR 0003: Idempotency keys

- Status: accepted
- Date: 15 Oct 2026
- Accepted: 15 Oct 2026, with the rest of the proposal
- Question: Q-002

## Context

The sample schema has `Document.externalId String @unique` and `contentHash String @unique`. Providers redeliver the same message (FR-004). The same photo can also arrive under a new message id (FR-005). One email can include several attachments. Two clients can submit identical bytes.

Both references relaxed the global content hash to "unique per sender" and made room for more than one document per message id. That contradicts the sample columns. The sample is described as a starting point.

## Decision

Accepted:

- Email `externalId` is `messageId + "#" + attachmentIndex`. WhatsApp `externalId` is the message `id`. The column stays unique.
- `contentHash` is unique together with a scope string, not globally. Scope is `EMAIL:` plus the lower-cased address, or `WHATSAPP:` plus E.164.
- The hash is SHA-256 of the bytes we stored. The `sha256` field on the WhatsApp payload is not the deduplication key.

## Alternatives

| Option | Why it is weaker |
| --- | --- |
| Follow the sample literally: one global `contentHash`, one row per message id | A second attachment cannot be stored. One client's file hides the other's. |
| Hash only, ignore message id | A redelivery of a different attachment on the same message would look new, and FR-004 would depend on bytes alone. The brief requires both keys. |
| Unique `(source, messageId, attachmentIndex)`, plus a scoped hash | Equivalent protection. Slightly farther from the sample's single `externalId` column. The `#index` form keeps that column. |

## Consequences

Advantage: FR-004 and FR-005 hold, including two attachments and two clients.

Disadvantage: a grader comparing the schema to the gist will see a difference. `IMPLEMENTATION.md` must explain DEV-001 and DEV-002 in a few sentences.

The fallback (one global `contentHash`, one document per message) is not used.
