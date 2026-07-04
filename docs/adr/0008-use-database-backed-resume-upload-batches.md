---
status: accepted
---

# Use database-backed resume upload batches

Bulk resume upload is represented by persisted batches and batch items rather than an in-memory browser session. The user can leave and later resume the batch, failures are recorded per item, and single-user active-batch constraints are enforced by database state.

## Consequences

Batch cancellation does not roll back already-created resume records. Processing can skip failed items and continue, and UI progress should be derived from batch and item state rather than local component state.
