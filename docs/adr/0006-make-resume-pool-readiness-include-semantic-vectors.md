---
status: accepted
---

# Make resume pool readiness include semantic vectors

A resume-pool item is ready only after both structured parsing and semantic vectors for the pool source have been written. Importing a pool item into the resume library clones existing vectors to the new resume-record source identity instead of calling the embedding provider again.

## Consequences

Pool imports must fail rather than create a resume-library record missing semantic coverage. Historical ready pool items may need backfill before they can satisfy this invariant.
