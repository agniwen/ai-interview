import { and, eq, notInArray } from "drizzle-orm";
import { db } from "../../database";
import { QdrantResumeVectorStore } from "../qdrant/resume-vector-store";
import { embedResumeSemanticTexts } from "../resume/embedding";
import { getResumeSemanticIndexConfig, upsertResumeSemanticIndexState } from "../resume/indexer";
import { buildJobDescriptionSemanticTexts } from "../resume/text-builders";
import type { JobDescriptionSemanticInput } from "../resume/text-builders";
import type { ResumeEmbeddingChunk, ResumeVectorStore } from "../resume/vector-store";
import { department, jobDescription, resumeSemanticIndex } from "@app/db-schema/schema";
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

// deps 接口镜像 resume-semantic/indexer.ts 的 ResumeSemanticIndexerDeps，并补充 JD 删除清理状态。
export interface JdIndexerDeps {
  markDeleted: (input: {
    jobDescriptionId: string;
    organizationId: string;
  }) => Promise<void> | void;
  embed: (input: {
    apiKey: string;
    baseUrl: string;
    chunks: ReturnType<typeof buildJobDescriptionSemanticTexts>;
    dimensions: number;
    model: string;
  }) => Promise<ResumeEmbeddingChunk[]>;
  getConfig: () => JdSemanticIndexConfig;
  loadSource: (job: JdSemanticIndexJob) => Promise<JobDescriptionSemanticInput | null>;
  markFailed: (input: MarkFailedInput) => Promise<boolean | undefined> | boolean | undefined;
  markIndexed: (input: MarkIndexedInput) => Promise<boolean | undefined> | boolean | undefined;
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

async function loadJdSource(job: JdSemanticIndexJob): Promise<JobDescriptionSemanticInput | null> {
  const [row] = await db
    .select({
      departmentName: department.name,
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

async function updateJdSemanticIndexStateUnlessDeleted(
  input: MarkFailedInput | MarkIndexedInput,
  status: "failed" | "indexed",
): Promise<boolean> {
  const now = new Date();
  const [updated] = await db
    .update(resumeSemanticIndex)
    .set({
      contentHash: input.contentHash,
      embeddingModel: input.embeddingModel,
      errorMessage: status === "failed" && "errorMessage" in input ? input.errorMessage : null,
      lastIndexedAt: status === "indexed" ? now : null,
      profileHash: input.profileHash,
      status,
      updatedAt: now,
    })
    .where(
      and(
        eq(resumeSemanticIndex.sourceType, "job_description"),
        eq(resumeSemanticIndex.sourceId, input.sourceId),
        eq(resumeSemanticIndex.organizationId, input.organizationId),
        eq(resumeSemanticIndex.embeddingVersion, input.embeddingVersion),
        notInArray(resumeSemanticIndex.status, ["stale", "deleted"]),
      ),
    )
    .returning({ id: resumeSemanticIndex.id });
  return Boolean(updated);
}

function markJdSemanticIndexIndexed(input: MarkIndexedInput): Promise<boolean> {
  return updateJdSemanticIndexStateUnlessDeleted(input, "indexed");
}

function markJdSemanticIndexFailed(input: MarkFailedInput): Promise<boolean> {
  return updateJdSemanticIndexStateUnlessDeleted(input, "failed");
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
    async markDeleted(input) {
      await upsertResumeSemanticIndexState({
        contentHash: null,
        embeddingModel: config.model,
        embeddingVersion: config.embeddingVersion,
        errorMessage: "job description deleted; vector cleanup completed",
        organizationId: input.organizationId,
        profileHash: "deleted",
        sourceId: input.jobDescriptionId,
        sourceType: "job_description",
        status: "deleted",
      });
    },
    markFailed: markJdSemanticIndexFailed,
    markIndexed: markJdSemanticIndexIndexed,
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
    await deps.vectorStore.deleteResumeEmbeddings({
      organizationId: job.organizationId,
      sourceId: job.sourceId,
      sourceType: job.sourceType,
    });
    await deps.markDeleted({ jobDescriptionId: job.sourceId, organizationId: job.organizationId });
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
    // 删除可发生在 embedding 调用期间；写入前重新读取，避免已删除岗位的向量复活。
    if (!(await deps.loadSource(job))) {
      await deps.vectorStore.deleteResumeEmbeddings({
        organizationId: job.organizationId,
        sourceId: job.sourceId,
        sourceType: job.sourceType,
      });
      await deps.markDeleted({
        jobDescriptionId: job.sourceId,
        organizationId: job.organizationId,
      });
      return;
    }
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
    const markedIndexed = await deps.markIndexed({
      ...job,
      contentHash: null,
      embeddingModel: config.model,
      embeddingVersion: config.embeddingVersion,
      profileHash,
    });
    if (markedIndexed === false) {
      await deps.vectorStore.deleteResumeEmbeddings({
        organizationId: job.organizationId,
        sourceId: job.sourceId,
        sourceType: job.sourceType,
      });
      await deps.markDeleted({
        jobDescriptionId: job.sourceId,
        organizationId: job.organizationId,
      });
    }
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
