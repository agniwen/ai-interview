import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@app/server/lib/server/db";
import { resumePoolItem, resumeSemanticIndex, studioInterview } from "@arc/db-schema/schema";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeSemanticIndexJobData } from "@arc/resume-parse-queue/resume-semantic-index";
import { getCandidateActivityStatus } from "@arc/shared/candidate-pipeline-machine";
import { QdrantResumeVectorStore } from "../qdrant/resume-vector-store";
import { embedResumeSemanticTexts, getResumeEmbeddingConfig } from "./embedding";
import { hashResumeProfileForSemanticIndex } from "./profile-hash";
import { buildResumeSemanticTexts } from "./text-builders";
import type { ResumeEmbeddingChunk, ResumeVectorStore } from "./vector-store";

interface ResumeSemanticIndexConfig {
  apiKey: string;
  baseUrl: string;
  dimensions: number;
  embeddingVersion: string;
  model: string;
  qdrantApiKey: string | null;
  qdrantCollectionName: string;
  qdrantUrl: string;
}

interface ResumeSemanticSource {
  contentHash: string | null;
  profile: ResumeProfile;
  status: "active" | "archived";
}

interface ExistingIndexState {
  profileHash: string;
  status: string;
}

interface MarkSkippedInput extends ResumeSemanticIndexJobData {
  embeddingModel: string;
  embeddingVersion: string;
  profileHash: string;
  reason: string;
}

interface MarkFailedInput extends ResumeSemanticIndexJobData {
  contentHash: string | null;
  embeddingModel: string;
  embeddingVersion: string;
  errorMessage: string;
  profileHash: string;
}

interface MarkIndexedInput extends ResumeSemanticIndexJobData {
  contentHash: string | null;
  embeddingModel: string;
  embeddingVersion: string;
  profileHash: string;
}

interface ResumeSemanticIndexerDeps {
  embed: (input: {
    apiKey: string;
    baseUrl: string;
    chunks: ReturnType<typeof buildResumeSemanticTexts>;
    dimensions: number;
    model: string;
  }) => Promise<ResumeEmbeddingChunk[]>;
  getConfig: () => ResumeSemanticIndexConfig;
  loadSource: (job: ResumeSemanticIndexJobData) => Promise<ResumeSemanticSource | null>;
  markFailed: (input: MarkFailedInput) => Promise<void> | void;
  markIndexed: (input: MarkIndexedInput) => Promise<void> | void;
  markSkipped: (input: MarkSkippedInput) => Promise<void> | void;
  readIndexState: (input: {
    embeddingVersion: string;
    profileHash: string;
    sourceId: string;
    sourceType: ResumeSemanticIndexJobData["sourceType"];
  }) => Promise<ExistingIndexState | null>;
  vectorStore: ResumeVectorStore;
}

interface PrepareResumeSemanticIndexDeps {
  getConfig: () => ResumeSemanticIndexConfig;
  loadSource: (job: ResumeSemanticIndexJobData) => Promise<ResumeSemanticSource | null>;
  markPending: (input: {
    contentHash: string | null;
    embeddingModel: string;
    embeddingVersion: string;
    errorMessage: null;
    organizationId: string;
    profileHash: string;
    sourceId: string;
    sourceType: ResumeSemanticIndexJobData["sourceType"];
    status: "pending";
  }) => Promise<void> | void;
  readIndexState: ResumeSemanticIndexerDeps["readIndexState"];
}

const SKIPPED_PROFILE_HASH = "skipped";

export function getResumeSemanticIndexConfig(): ResumeSemanticIndexConfig {
  const embedding = getResumeEmbeddingConfig();
  return {
    ...embedding,
    embeddingVersion: process.env.RESUME_EMBEDDING_VERSION || "dashscope-text-embedding-v4-1024-v1",
    qdrantApiKey: process.env.QDRANT_API_KEY || null,
    qdrantCollectionName: process.env.QDRANT_RESUME_COLLECTION || "resume_semantic_v1",
    qdrantUrl: process.env.QDRANT_URL || "",
  };
}

export async function prepareResumeSemanticIndexJob(
  job: ResumeSemanticIndexJobData,
  deps?: PrepareResumeSemanticIndexDeps,
): Promise<boolean> {
  const resolvedDeps = deps ?? {
    getConfig: getResumeSemanticIndexConfig,
    // oxlint-disable-next-line no-use-before-define -- DB adapter stays below the domain workflow.
    loadSource: loadResumeSemanticSource,
    // oxlint-disable-next-line no-use-before-define -- DB adapter stays below the domain workflow.
    markPending: upsertResumeSemanticIndexState,
    // oxlint-disable-next-line no-use-before-define -- DB adapter stays below the domain workflow.
    readIndexState: readSemanticIndexState,
  };
  const config = resolvedDeps.getConfig();
  const source = await resolvedDeps.loadSource(job);
  if (!source) {
    return false;
  }
  const profileHash = hashResumeProfileForSemanticIndex(source.profile);
  const existing = await resolvedDeps.readIndexState({
    embeddingVersion: config.embeddingVersion,
    profileHash,
    sourceId: job.sourceId,
    sourceType: job.sourceType,
  });
  if (existing?.status === "indexed" && existing.profileHash === profileHash) {
    return false;
  }
  await resolvedDeps.markPending({
    contentHash: source.contentHash,
    embeddingModel: config.model,
    embeddingVersion: config.embeddingVersion,
    errorMessage: null,
    organizationId: job.organizationId,
    profileHash,
    sourceId: job.sourceId,
    sourceType: job.sourceType,
    status: "pending",
  });
  return true;
}

export async function listRecoverableResumeSemanticIndexJobs(
  limit = 500,
): Promise<ResumeSemanticIndexJobData[]> {
  const config = getResumeSemanticIndexConfig();
  const rows = await db
    .select({
      organizationId: resumeSemanticIndex.organizationId,
      sourceId: resumeSemanticIndex.sourceId,
      sourceType: resumeSemanticIndex.sourceType,
    })
    .from(resumeSemanticIndex)
    .where(
      and(
        eq(resumeSemanticIndex.embeddingVersion, config.embeddingVersion),
        or(
          inArray(resumeSemanticIndex.status, ["pending", "failed"]),
          and(
            eq(resumeSemanticIndex.sourceType, "job_description"),
            eq(resumeSemanticIndex.status, "stale"),
          ),
        ),
      ),
    )
    .limit(limit);
  return rows;
}

function semanticIndexId(sourceType: string, sourceId: string, embeddingVersion: string): string {
  return `${sourceType}:${sourceId}:${embeddingVersion}`;
}

export async function runResumeSemanticIndexJob(
  job: ResumeSemanticIndexJobData,
  // oxlint-disable-next-line no-use-before-define -- default dependency factory stays below the public entrypoint.
  deps: ResumeSemanticIndexerDeps = createDefaultIndexerDeps(),
): Promise<void> {
  const config = deps.getConfig();
  const source = await deps.loadSource(job);
  if (!source) {
    await deps.markSkipped({
      ...job,
      embeddingModel: config.model,
      embeddingVersion: config.embeddingVersion,
      profileHash: SKIPPED_PROFILE_HASH,
      reason: "resume profile is not ready",
    });
    return;
  }

  const profileHash = hashResumeProfileForSemanticIndex(source.profile);
  const existing = await deps.readIndexState({
    embeddingVersion: config.embeddingVersion,
    profileHash,
    sourceId: job.sourceId,
    sourceType: job.sourceType,
  });
  if (existing?.status === "indexed" && existing.profileHash === profileHash) {
    return;
  }

  try {
    const chunks = buildResumeSemanticTexts(source.profile);
    const embeddings = await deps.embed({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      chunks,
      dimensions: config.dimensions,
      model: config.model,
    });
    await deps.vectorStore.ensureCollection();
    await deps.vectorStore.upsertResumeEmbeddings({
      chunks: embeddings,
      contentHash: source.contentHash,
      embeddingModel: config.model,
      embeddingVersion: config.embeddingVersion,
      organizationId: job.organizationId,
      profileHash,
      sourceId: job.sourceId,
      sourceType: job.sourceType,
      status: source.status,
    });
    await deps.markIndexed({
      ...job,
      contentHash: source.contentHash,
      embeddingModel: config.model,
      embeddingVersion: config.embeddingVersion,
      profileHash,
    });
  } catch (error) {
    await deps.markFailed({
      ...job,
      contentHash: source.contentHash,
      embeddingModel: config.model,
      embeddingVersion: config.embeddingVersion,
      errorMessage: error instanceof Error ? error.message : String(error),
      profileHash,
    });
    throw error;
  }
}

export function createDefaultIndexerDeps(): ResumeSemanticIndexerDeps {
  const config = getResumeSemanticIndexConfig();
  if (!config.qdrantUrl) {
    throw new Error("QDRANT_URL is not configured.");
  }
  return {
    embed: embedResumeSemanticTexts,
    getConfig: () => config,
    // oxlint-disable-next-line no-use-before-define -- DB helpers are defined below the dependency factory.
    loadSource: loadResumeSemanticSource,
    // oxlint-disable-next-line no-use-before-define -- DB helpers are defined below the dependency factory.
    markFailed: markSemanticIndexFailed,
    // oxlint-disable-next-line no-use-before-define -- DB helpers are defined below the dependency factory.
    markIndexed: markSemanticIndexIndexed,
    // oxlint-disable-next-line no-use-before-define -- DB helpers are defined below the dependency factory.
    markSkipped: markSemanticIndexSkipped,
    // oxlint-disable-next-line no-use-before-define -- DB helpers are defined below the dependency factory.
    readIndexState: readSemanticIndexState,
    vectorStore: new QdrantResumeVectorStore({
      apiKey: config.qdrantApiKey,
      collectionName: config.qdrantCollectionName,
      dimensions: config.dimensions,
      url: config.qdrantUrl,
    }),
  };
}

async function loadResumeSemanticSource(
  job: ResumeSemanticIndexJobData,
): Promise<ResumeSemanticSource | null> {
  if (job.sourceType === "studio_interview") {
    const [row] = await db
      .select({
        contentHash: studioInterview.resumeContentHash,
        parseStatus: studioInterview.resumeParseStatus,
        pipelineStage: studioInterview.pipelineStage,
        profile: studioInterview.resumeProfile,
      })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, job.sourceId),
          eq(studioInterview.organizationId, job.organizationId),
        ),
      )
      .limit(1);
    if (!row?.profile || row.parseStatus !== "ready") {
      return null;
    }
    return {
      contentHash: row.contentHash,
      profile: row.profile,
      status: getCandidateActivityStatus(row.pipelineStage),
    };
  }

  const [row] = await db
    .select({
      contentHash: resumePoolItem.resumeContentHash,
      parseStatus: resumePoolItem.resumeParseStatus,
      profile: resumePoolItem.resumeProfile,
      status: resumePoolItem.status,
    })
    .from(resumePoolItem)
    .where(
      and(
        eq(resumePoolItem.id, job.sourceId),
        eq(resumePoolItem.organizationId, job.organizationId),
      ),
    )
    .limit(1);
  if (!row?.profile || !["processing", "ready"].includes(row.parseStatus)) {
    return null;
  }
  return {
    contentHash: row.contentHash,
    profile: row.profile,
    status: row.status === "archived" ? "archived" : "active",
  };
}

async function readSemanticIndexState(input: {
  embeddingVersion: string;
  profileHash: string;
  sourceId: string;
  sourceType: ResumeSemanticIndexJobData["sourceType"];
}): Promise<ExistingIndexState | null> {
  const [row] = await db
    .select({
      profileHash: resumeSemanticIndex.profileHash,
      status: resumeSemanticIndex.status,
    })
    .from(resumeSemanticIndex)
    .where(
      and(
        eq(resumeSemanticIndex.sourceType, input.sourceType),
        eq(resumeSemanticIndex.sourceId, input.sourceId),
        eq(resumeSemanticIndex.embeddingVersion, input.embeddingVersion),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertResumeSemanticIndexState(input: {
  contentHash: string | null;
  embeddingModel: string;
  embeddingVersion: string;
  errorMessage: string | null;
  organizationId: string;
  profileHash: string;
  sourceId: string;
  sourceType: ResumeSemanticIndexJobData["sourceType"];
  status: "deleted" | "failed" | "indexed" | "pending" | "skipped" | "stale";
}): Promise<void> {
  const now = new Date();
  await db
    .insert(resumeSemanticIndex)
    .values({
      contentHash: input.contentHash,
      embeddingModel: input.embeddingModel,
      embeddingVersion: input.embeddingVersion,
      errorMessage: input.errorMessage,
      id: semanticIndexId(input.sourceType, input.sourceId, input.embeddingVersion),
      lastIndexedAt: input.status === "indexed" ? now : null,
      organizationId: input.organizationId,
      profileHash: input.profileHash,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      status: input.status,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        contentHash: input.contentHash,
        embeddingModel: input.embeddingModel,
        errorMessage: input.errorMessage,
        lastIndexedAt: input.status === "indexed" ? now : null,
        profileHash: input.profileHash,
        status: input.status,
        updatedAt: now,
      },
      target: [
        resumeSemanticIndex.sourceType,
        resumeSemanticIndex.sourceId,
        resumeSemanticIndex.embeddingVersion,
      ],
    });
}

function markSemanticIndexIndexed(input: MarkIndexedInput): Promise<void> {
  return upsertResumeSemanticIndexState({ ...input, errorMessage: null, status: "indexed" });
}

function markSemanticIndexFailed(input: MarkFailedInput): Promise<void> {
  return upsertResumeSemanticIndexState({
    ...input,
    errorMessage: input.errorMessage,
    status: "failed",
  });
}

function markSemanticIndexSkipped(input: MarkSkippedInput): Promise<void> {
  return upsertResumeSemanticIndexState({
    ...input,
    contentHash: null,
    errorMessage: input.reason,
    status: "skipped",
  });
}
