# Qdrant Resume Semantic Dedup Design

## Goal

Add a semantic resume index that uses Qdrant and DashScope embeddings to detect rewritten or beautified duplicate resumes, while keeping PostgreSQL as the business source of truth. The same index must later support job-to-resume recommendation.

## Current Context

The original dedup flow was identity based: it checked current-organization `studio_interview` rows by name, email, or phone. That path is now removed from the active dedup flow. Duplicate detection is based on semantic similarity over parsed resume profiles, so changed contact details do not bypass recall and matching contact details alone do not create a duplicate hit.

Resume facts already exist in PostgreSQL:

- `studio_interview.resume_profile`
- `resume_pool_item.resume_profile`
- `chat_attachment.parsed_structured` and `parsed_text`

Bulk resume parsing already runs through a BullMQ-backed worker, so semantic indexing should run asynchronously after parsing succeeds.

## Embedding Provider

Use Alibaba Cloud Model Studio / DashScope `text-embedding-v4` through the OpenAI-compatible embeddings API.

Default configuration:

- Provider: `dashscope`
- Model: `text-embedding-v4`
- Dimensions: `1024`
- API mode: OpenAI-compatible `/v1/embeddings`

Region-specific base URLs:

- China mainland: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- International: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- Hong Kong: `https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1`

The model supports Chinese and English plus broad multilingual text, which fits Chinese-first resumes and overseas deployments.

## Vector Shape

Each parsed resume produces three vectors:

1. `resume_overview`
   - Overall candidate summary.
   - Used for broad duplicate recall and future generic search.
2. `work_project`
   - Work experience and project experience.
   - Primary duplicate-rewrite signal.
3. `skill_role`
   - Skills, target roles, seniority, recent role.
   - Primary recommendation signal.

Qdrant collection: `resume_semantic_v1`.

Node runtime uses the official `@qdrant/js-client-rest` SDK. Keep it on the REST client for the demo and early production stage; gRPC can be revisited only if Qdrant latency becomes a measured bottleneck.

Payload fields:

- `organizationId`
- `sourceType`: `studio_interview | resume_pool_item`
- `sourceId`
- `chunkType`: `resume_overview | work_project | skill_role`
- `contentHash`
- `profileHash`
- `status`: `active | archived`
- `embeddingModel`
- `embeddingVersion`

Qdrant only stores vectors and minimal payload. Full resume details remain in PostgreSQL.

## PostgreSQL State

Add `resume_semantic_index` to track indexing state:

- `organization_id`
- `source_type`
- `source_id`
- `content_hash`
- `profile_hash`
- `embedding_model`
- `embedding_version`
- `status`: `pending | indexed | failed | stale | skipped`
- `last_indexed_at`
- `error_message`

Add `resume_duplicate_match` for optional match snapshots:

- source and matched source identifiers
- `score`
- `level`: `high | medium | low`
- `reasons`
- `signals`
- `embedding_version`

## Indexing Flow

1. A resume reaches `resumeParseStatus = ready`.
2. Backend enqueues a semantic-index job with `organizationId`, `sourceType`, and `sourceId`.
3. Worker loads the current PostgreSQL source row.
4. Worker builds three normalized texts and computes `profileHash`.
5. If the same source/version/hash is already indexed, the worker exits.
6. Worker calls DashScope embeddings.
7. Worker upserts three Qdrant points with stable IDs:
   - `${sourceType}:${sourceId}:resume_overview:${embeddingVersion}`
   - `${sourceType}:${sourceId}:work_project:${embeddingVersion}`
   - `${sourceType}:${sourceId}:skill_role:${embeddingVersion}`
8. Worker marks `resume_semantic_index.status = indexed`.

Indexing failure must not block resume upload, parsing, or saving.

## Dedup Flow

`/studio/interviews/dedup-check` and `/studio/resumes/dedup-check` stay stable but return richer match records.

Steps:

1. If semantic indexing is enabled and a parsed profile is available, build query texts and embeddings.
2. Query Qdrant:
   - `work_project` Top 50
   - `resume_overview` Top 50
   - `skill_role` Top 30
3. Merge candidates by source id.
4. Load candidate profiles from PostgreSQL.
5. Rerank with vector similarity, education, work/project overlap, and skill overlap.
6. Return Top 10 with score, level, reasons, conflicting signals, and similarity details.

Score levels:

- `>= 92`: `high`
- `75-91`: `medium`
- `< 75`: `low`

Qdrant or embedding failures return no duplicate matches and do not block resume upload, parsing, or saving.

## Frontend Interaction

Semantic dedup is a risk review, not a hard blocker.

Single upload:

- No matches: continue normally.
- High risk: show a warning panel. Primary action is `查看已有候选人`; secondary action is `仍然创建新记录`; cancel remains available.
- Medium risk: show a warning panel. Primary action is `继续创建`; secondary action is `查看已有候选人`.
- Low risk: do not interrupt.

The panel shows:

- Risk level and score.
- Existing candidate record.
- Semantic reasons such as similar project experience, overlapping work timeline, or skill-stack overlap.
- Conflicting signals such as different email or phone.
- Existing detail link.

Bulk upload:

- `dedupPolicy=create`: create rows.
- `dedupPolicy=skip`: semantic high/medium-risk matches become `duplicate_skipped`; identity fields alone never skip a row.

## Recommendation Reuse

The same Qdrant collection supports future recommendations:

- JD text embeds into a query vector.
- `skill_role` is the primary recall chunk.
- `work_project` is secondary recall.
- PostgreSQL performs final authorization, status filtering, and business reranking.

## Rollout

1. Add DB schema and Qdrant/DashScope config.
2. Add indexer in disabled mode.
3. Enable indexing for newly parsed resumes.
4. Add backfill script for historical ready resumes.
5. Run semantic dedup in shadow mode.
6. Show rich duplicate results in the existing overlay.
7. Upgrade bulk skip policy after enough review data.
