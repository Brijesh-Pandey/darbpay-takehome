# ADR 0006: Processing model

- Status: accepted
- Date: 15 Oct 2026
- Accepted: 15 Oct 2026, with the rest of the proposal
- Question: Q-004

## Context

FR-006 says the webhook must return quickly and must not return 500 because extraction or matching failed. The bytes have to be available after the response, including if the process is still alive and if a duplicate delivery arrives while the first document is still `RECEIVED`.

Ashu stores the bytes on the document row and processes in `after()`. BetaPundit stores them in a content-addressed blob directory, adds a processing lease, and also uses `after()`. A real queue is the production answer both write-ups name and neither require for the exercise.

## Decision

Accepted:

- Persist the file on `Document.content`, with `mimeType`. No blob store, no object storage.
- Insert `RECEIVED`, respond, then run extraction and matching in `after()`.
- Claim the row with a compare-and-set from `RECEIVED` to `EXTRACTED` so two workers do not both extract.
- Store `processingStartedAt`. A later retry may reclaim a claim older than 5 minutes. No cron in this exercise. Redelivery of a document still in `RECEIVED` schedules processing again.
- Services are plain functions. Only route handlers call `after()`, so tests invoke processing directly.

## Alternatives

| Option | Why it is not the proposal |
| --- | --- |
| Extract inside the request | A slow or stuck extractor makes the provider retry, which fights FR-006. |
| Keep bytes only in the `after()` closure | A crash loses the file. The row cannot be retried. |
| Separate blob store | A second storage API for a SQLite exercise. More failure modes (missing blob). |
| A queue and worker | Right for production. Out of scope for NFR-007. |

## Consequences

Advantage: one database holds the file and the status. Tests do not need a disk layout beyond fixtures. The webhook can return before OCR.

Disadvantage: SQLite rows carry blobs. Fine at fixture size. A 10 MiB cap is part of this proposal. `after()` is best-effort. A crash leaves `RECEIVED` until redelivery or a manual reclaim. The README must say that when the server exists.

Bytes stay on the document row. There is no separate blob store.
