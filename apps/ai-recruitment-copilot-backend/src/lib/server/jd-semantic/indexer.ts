import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { QdrantResumeVectorStore } from "@arc/ai-recruitment-copilot-backend/lib/server/qdrant/resume-vector-store";
import { embedResumeSemanticTexts } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/embedding";
import {
  getResumeSemanticIndexConfig,
  upsertResumeSemanticIndexState,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/indexer";
import { buildJobDescriptionSemanticTexts } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/text-builders";
import type { JobDescriptionSemanticInput } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/text-builders";
import type {
  ResumeEmbeddingChunk,
  ResumeVectorStore,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/vector-store";
import { department, jobDescription, resumeSemanticIndex } from "@arc/db-schema/schema";
import { hashJobDescriptionForSemanticIndex } from "./hash";

export interface JdSemanticIndexJob {
  organizationId: string;
  sourceId: string;
  sourceType: "job_description";
}

interface JdSemanticIndexConfig {
  apiKey: string;
  baseUrl: string;
  dimensions: number;
  embeddingVersion: string;
  model: string;
  qdrantApiKey: string | null;
  qdrantCollectionName: string;
  qdrantUrl: string;
}

interface ExistingIndexState {
  profileHash: string;
  status: string;
}

interface MarkSkippedInput extends JdSemanticIndexJob {
  embeddingModel: string;
  embeddingVersion: string;
  profileHash: string;
  reason: string;
}

interface MarkFailedInput extends JdSemanticIndexJob {
  contentHash: string | null;
  embeddingModel: string;
  embeddingVersion: string;
  errorMessage: string;
  profileHash: string;
}

interface MarkIndexedInput extends JdSemanticIndexJob {
  contentHash: string | null;
  embeddingModel: string;
  embeddingVersion: string;
  profileHash: string;
}

// deps 接口镜像 resume-semantic/indexer.ts 的 ResumeSemanticIndexerDeps（getConfig/loadSource/
// embed/vectorStore/readIndexState/markIndexed/markFailed/markSkipped）。
export interface JdIndexerDeps {
  embed: (input: {
    apiKey: string;
    baseUrl: string;
    chunks: ReturnType<typeof buildJobDescriptionSemanticTexts>;
    dimensions: number;
    model: string;
  }) => Promise<ResumeEmbeddingChunk[]>;
  getConfig: () => JdSemanticIndexConfig;
  loadSource: (job: JdSemanticIndexJob) => Promise<JobDescriptionSemanticInput | null>;
  markFailed: (input: MarkFailedInput) => Promise<void> | void;
  markIndexed: (input: MarkIndexedInput) => Promise<void> | void;
  markSkipped: (input: MarkSkippedInput) => Promise<void> | void;
  readIndexState: (input: {
    embeddingVersion: string;
    profileHash: string;
    sourceId: string;
    sourceType: JdSemanticIndexJob["sourceType"];
  }) => Promise<ExistingIndexState | null>;
  vectorStore: ResumeVectorStore;
}

interface PrepareJdIndexerDeps {
  getConfig: () => JdSemanticIndexConfig;
  loadSource: (job: JdSemanticIndexJob) => Promise<JobDescriptionSemanticInput | null>;
  markPending: (input: {
    contentHash: string | null;
    embeddingModel: string;
    embeddingVersion: string;
    errorMessage: null;
    organizationId: string;
    profileHash: string;
    sourceId: string;
    sourceType: JdSemanticIndexJob["sourceType"];
    status: "pending";
  }) => Promise<void> | void;
  readIndexState: JdIndexerDeps["readIndexState"];
}

const SKIPPED_PROFILE_HASH = "skipped";

async function loadJdSource(job: JdSemanticIndexJob): Promise<JobDescriptionSemanticInput | null> {
  const [row] = await db
    .select({
      departmentName: department.name,
      description: jobDescription.description,
      id: jobDescription.id,
      name: jobDescription.name,
      prompt: jobDescription.prompt,
    })
    .from(jobDescription)
    .leftJoin(department, eq(department.id, jobDescription.departmentId))
    .where(
      and(
        eq(jobDescription.id, job.sourceId),
        eq(jobDescription.organizationId, job.organizationId),
        eq(jobDescription.lifecycleStatus, "published"),
      ),
    )
    .limit(1);
  return row ?? null;
}

// profileHash 不参与 WHERE，只用 (sourceType, sourceId, embeddingVersion) 查询——
// 镜像 resume-semantic/indexer.ts 的 readSemanticIndexState。
async function readJdSemanticIndexState(input: {
  embeddingVersion: string;
  profileHash: string;
  sourceId: string;
  sourceType: JdSemanticIndexJob["sourceType"];
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

function markJdSemanticIndexIndexed(input: MarkIndexedInput): Promise<void> {
  return upsertResumeSemanticIndexState({ ...input, errorMessage: null, status: "indexed" });
}

function markJdSemanticIndexFailed(input: MarkFailedInput): Promise<void> {
  return upsertResumeSemanticIndexState({
    ...input,
    errorMessage: input.errorMessage,
    status: "failed",
  });
}

function markJdSemanticIndexSkipped(input: MarkSkippedInput): Promise<void> {
  return upsertResumeSemanticIndexState({
    ...input,
    contentHash: null,
    errorMessage: input.reason,
    status: "skipped",
  });
}

export function createDefaultJdIndexerDeps(): JdIndexerDeps {
  const config = getResumeSemanticIndexConfig();
  if (!config.qdrantUrl) {
    throw new Error("QDRANT_URL is not configured.");
  }
  return {
    embed: embedResumeSemanticTexts,
    getConfig: () => config,
    loadSource: loadJdSource,
    markFailed: markJdSemanticIndexFailed,
    markIndexed: markJdSemanticIndexIndexed,
    markSkipped: markJdSemanticIndexSkipped,
    readIndexState: readJdSemanticIndexState,
    vectorStore: new QdrantResumeVectorStore({
      apiKey: config.qdrantApiKey,
      collectionName: config.qdrantCollectionName,
      dimensions: config.dimensions,
      url: config.qdrantUrl,
    }),
  };
}

export async function runJdSemanticIndexJob(
  job: JdSemanticIndexJob,
  deps: JdIndexerDeps = createDefaultJdIndexerDeps(),
): Promise<void> {
  const config = deps.getConfig();
  const source = await deps.loadSource(job);
  if (!source) {
    await deps.markSkipped({
      ...job,
      embeddingModel: config.model,
      embeddingVersion: config.embeddingVersion,
      profileHash: SKIPPED_PROFILE_HASH,
      reason: "job description not found",
    });
    return;
  }

  const profileHash = hashJobDescriptionForSemanticIndex(source);
  // readIndexState 的 WHERE 只用 (sourceType, sourceId, embeddingVersion)——profileHash 只被
  // SELECT 返回、不参与过滤（镜像 resume 版 readSemanticIndexState），所以 hash 变化时仍能读到
  // 旧 indexed 行，再由下面的 existing.profileHash===profileHash 比较决定是否跳过。
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
    const chunks = buildJobDescriptionSemanticTexts(source);
    const embeddings = await deps.embed({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      chunks,
      dimensions: config.dimensions,
      model: config.model,
    });
    await deps.vectorStore.ensureCollection();
    // profileHash 列复用了 resume_semantic_index 表的既有列名——JD 侧存的是 JD 内容 hash
    // （hashJobDescriptionForSemanticIndex 的结果），不是 resume profile hash，避免维护者误解。
    await deps.vectorStore.upsertResumeEmbeddings({
      chunks: embeddings,
      contentHash: null,
      embeddingModel: config.model,
      embeddingVersion: config.embeddingVersion,
      organizationId: job.organizationId,
      profileHash,
      sourceId: job.sourceId,
      sourceType: job.sourceType,
      status: "active",
    });
    await deps.markIndexed({
      ...job,
      contentHash: null,
      embeddingModel: config.model,
      embeddingVersion: config.embeddingVersion,
      profileHash,
    });
  } catch (error) {
    await deps.markFailed({
      ...job,
      contentHash: null,
      embeddingModel: config.model,
      embeddingVersion: config.embeddingVersion,
      errorMessage: error instanceof Error ? error.message : String(error),
      profileHash,
    });
    throw error;
  }
}

export async function prepareJdSemanticIndexJob(
  job: JdSemanticIndexJob,
  deps?: PrepareJdIndexerDeps,
): Promise<boolean> {
  const resolvedDeps = deps ?? {
    getConfig: getResumeSemanticIndexConfig,
    loadSource: loadJdSource,
    markPending: upsertResumeSemanticIndexState,
    readIndexState: readJdSemanticIndexState,
  };
  const config = resolvedDeps.getConfig();
  const source = await resolvedDeps.loadSource(job);
  if (!source) {
    return false;
  }
  const profileHash = hashJobDescriptionForSemanticIndex(source);
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
    contentHash: null,
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
