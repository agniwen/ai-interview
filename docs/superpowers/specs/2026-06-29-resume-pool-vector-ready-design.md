# Resume Pool Vector Ready Design

## Goal

Move resume semantic vector generation as far upstream as possible by making the resume pool the canonical place where parsed resume vectors are produced. A resume pool item is not considered parse-ready until its `resume_pool_item` vectors have been written to Qdrant.

When a pool item is imported into the resume library, the import should reuse the existing pool vectors and clone them to the new `studio_interview` source identity instead of calling the embedding provider again.

## Current Context

The semantic index currently writes Qdrant points from `runResumeSemanticIndexJob` after a source row reaches `resumeParseStatus = ready`. That means parsing can complete before Qdrant is updated.

There are two source identities:

- `resume_pool_item`
- `studio_interview`

Qdrant point IDs are derived from `sourceType`, `sourceId`, `chunkType`, and `embeddingVersion`, so importing a pool resume into the resume library still needs `studio_interview` points. JD recommendation currently searches `studio_interview` sources only.

The batch resume upload path already runs through a BullMQ worker. Single resume-pool upload currently parses inside the request path.

## Decisions

1. `resume_pool_item.resumeParseStatus = "ready"` means both structured parsing and `resume_pool_item` semantic vectors are complete.
2. Pool vector failures keep the pool item out of `ready`; worker-backed parsing uses the existing worker retry path, and synchronous single upload returns an error.
3. Importing from the pool to the resume library must clone vectors to `studio_interview` points and fail the import if cloning fails.
4. The import path must not call DashScope embeddings when the pool source is already indexed for the current embedding version and profile hash.
5. Deleting a pool item deletes only `resume_pool_item` vectors. Deleting a resume-library record deletes only `studio_interview` vectors.

## Resume Pool Parse Flow

For worker-backed pool parsing:

1. Worker parses the resume and builds `resumeProfile` plus `resumeText`.
2. Worker writes or updates the `resume_pool_item` row with parsed content, but does not mark it `ready` yet.
3. Worker runs semantic indexing for the same `resume_pool_item` in-process.
4. Semantic indexing builds the three existing chunks:
   - `resume_overview`
   - `work_project`
   - `skill_role`
5. Indexing upserts the three Qdrant points and marks `resume_semantic_index.status = "indexed"`.
6. Only after indexing succeeds does the worker set `resume_pool_item.resumeParseStatus = "ready"` and `resumeParsedAt`.

For single resume-pool upload:

- If the endpoint continues to parse synchronously, it must also write `resume_pool_item` vectors before returning a `ready` item.
- Fully asynchronous single upload is intentionally out of scope for this change. It would require a separate UX/API change so the client can show a queued pool item.

## Import Flow

When importing a `resume_pool_item` into the resume library:

1. Keep the existing guard that only `resumeParseStatus = "ready"` pool items can be imported.
2. Create the `studio_interview` row from the pool row inside the existing import transaction.
3. After the row exists, clone the current-version Qdrant vectors from:
   - `sourceType = "resume_pool_item"`
   - `sourceId = poolItem.id`
4. Upsert cloned points with:
   - `sourceType = "studio_interview"`
   - `sourceId = resumeRecordId`
   - the same vectors and semantic payload fields that still apply
   - `profileHash`, `contentHash`, `embeddingModel`, and `embeddingVersion` matching the pool source
5. Upsert `resume_semantic_index` for the new `studio_interview` source as `indexed`.
6. If clone fails, delete the newly created `studio_interview` row and return an import error so the user does not see an imported resume that is missing semantic-search coverage.

The implementation should prefer a transaction shape that keeps PostgreSQL consistent. Qdrant cannot participate in the database transaction, so the clone helper must be idempotent and safe to retry.

## Vector Store API

Add a focused read path to the resume vector store:

- `loadResumeEmbeddings({ sourceType, sourceId, embeddingVersion })`

This returns the existing three chunk vectors plus payload metadata needed for clone validation. It must reject incomplete source sets, wrong embedding versions, and profile-hash mismatches.

Add a clone-oriented helper at the semantic layer rather than exposing Qdrant details to route DAOs:

- `cloneResumeSemanticIndexFromPoolToInterview({ organizationId, poolItemId, resumeRecordId })`

The helper should:

1. Load the pool semantic index state from PostgreSQL.
2. Verify current embedding version, `status = "indexed"`, and expected `profileHash`.
3. Read pool vectors from Qdrant.
4. Upsert `studio_interview` vectors with stable IDs.
5. Write the `studio_interview` semantic index state.

## Error Handling

Pool parse:

- Embedding or Qdrant failures are parse failures for pool readiness.
- Worker retries should retry the full parse/index step.
- After retries are exhausted, the pool item remains non-ready with a useful parse/index error.

Import:

- Clone failure fails the import request.
- The user should not receive a successful import response until `studio_interview` vectors exist.
- A retry of the import must be safe. If clone fails after the `studio_interview` row is created, the import path deletes that row and its semantic index state before returning the error.

## Read Paths

Semantic duplicate detection can continue to search both source types as it does today.

JD recommendation can continue to search `studio_interview`. Because import clones vectors before success, recommendations do not need to know about pool sources.

## Non-Goals

- Do not change the embedding model, vector shape, Qdrant collection name, or scoring logic.
- Do not make JD recommendation search pool items in this change.
- Do not redesign the single-upload UI into a queued asynchronous flow in this change.
- Do not introduce a second vector collection.

## Testing

Add focused tests for:

- Worker-backed pool parsing does not mark a pool item `ready` until semantic indexing succeeds.
- Pool indexing failure leaves the pool item non-ready and records the error.
- Import clones vectors from `resume_pool_item` to `studio_interview` without calling the embedding provider.
- Import fails when pool vectors are missing, stale, or incomplete.
- Deleting pool/library records deletes only the matching source type vectors.

## Migration And Backfill

Existing `ready` pool items may not have guaranteed Qdrant vectors. Run the existing semantic backfill for pool records before relying on the new invariant in production.

After deployment, the import path treats old `ready` pool items without vectors as invalid for import and returns an explicit "semantic index not ready" error until backfill indexes them.
