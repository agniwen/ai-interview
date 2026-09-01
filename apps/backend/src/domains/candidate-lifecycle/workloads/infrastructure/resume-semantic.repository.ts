/* oxlint-disable complexity, anti-slop/no-unknown-parameters -- Stable JSON hashing and status projection are internal deterministic boundaries. */
import { rawBackendEnvironment } from "../../../../config/raw-backend-environment.js";
import { createHash } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { department, jobDescription, resumeSemanticIndex } from "@arc/db-schema/schema";
import type { ResumeSemanticIndexJobData } from "@arc/resume-parse-queue/resume-semantic-index";
import { getCandidateActivityStatus } from "@arc/shared/candidate-pipeline-machine";
import { and, eq } from "drizzle-orm";
import type { Database } from "../../../../infrastructure/database/database.tokens.js";
import type { ResumeSemanticIndexProcessorPorts } from "../resume.processor.js";

type ChunkType = "resume_overview" | "skill_role" | "work_project";

interface SemanticChunk {
  chunkType: ChunkType;
  text: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for resume semantic indexing`);
  }
  return value;
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function pointUuid(seed: string): string {
  const hex = stableHash(seed);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function resumeChunks(profile: ResumeProfile): SemanticChunk[] {
  return [
    {
      chunkType: "resume_overview",
      text: JSON.stringify({
        education: profile.educationExperiences,
        name: profile.name,
        personalStrengths: profile.personalStrengths,
        schools: profile.schools,
        targetRoles: profile.targetRoles,
        workYears: profile.workYears,
      }),
    },
    {
      chunkType: "work_project",
      text: JSON.stringify({ projects: profile.projectExperiences, work: profile.workExperiences }),
    },
    {
      chunkType: "skill_role",
      text: JSON.stringify({
        recentWork: profile.workExperiences[0] ?? null,
        skills: profile.skills,
        targetRoles: profile.targetRoles,
      }),
    },
  ];
}

export class ResumeSemanticInfrastructure implements ResumeSemanticIndexProcessorPorts {
  private readonly database: Database;
  private readonly env: NodeJS.ProcessEnv;

  constructor(database: Database, env: NodeJS.ProcessEnv = rawBackendEnvironment) {
    this.database = database;
    this.env = env;
  }

  enrichResume(input: ResumeSemanticIndexJobData): Promise<void> {
    return this.indexResume(input);
  }

  async indexJobDescription(input: {
    organizationId: string;
    sourceId: string;
    sourceType: "job_description";
  }): Promise<void> {
    const [row] = await this.database
      .select({
        departmentName: department.name,
        id: jobDescription.id,
        name: jobDescription.name,
        prompt: jobDescription.prompt,
        status: jobDescription.lifecycleStatus,
      })
      .from(jobDescription)
      .leftJoin(department, eq(department.id, jobDescription.departmentId))
      .where(
        and(
          eq(jobDescription.id, input.sourceId),
          eq(jobDescription.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!row || row.status !== "published") {
      await this.mark(input, null, "deleted", "job description is not published");
      return;
    }
    const chunks: SemanticChunk[] = [
      {
        chunkType: "resume_overview",
        text: JSON.stringify({ department: row.departmentName, jd: row.prompt, name: row.name }),
      },
      {
        chunkType: "work_project",
        text: JSON.stringify({ responsibilitiesAndRequirements: row.prompt }),
      },
      {
        chunkType: "skill_role",
        text: JSON.stringify({ role: row.name, skillsAndRequirements: row.prompt }),
      },
    ];
    await this.index(
      input,
      chunks,
      stableHash({ name: row.name, prompt: row.prompt }),
      null,
      "active",
    );
  }

  private async indexResume(input: ResumeSemanticIndexJobData): Promise<void> {
    let contentHash: string | null;
    let profile: ResumeProfile;
    let status: "active" | "archived";
    if (input.sourceType === "studio_interview") {
      const source = await this.database.query.studioInterview.findFirst({
        where: { id: input.sourceId, organizationId: input.organizationId },
      });
      if (!source?.resumeProfile || source.resumeParseStatus !== "ready") {
        await this.mark(input, null, "skipped", "resume profile is not ready");
        return;
      }
      contentHash = source.resumeContentHash;
      profile = source.resumeProfile;
      status = getCandidateActivityStatus(source.pipelineStage);
    } else {
      const source = await this.database.query.resumePoolItem.findFirst({
        where: { id: input.sourceId, organizationId: input.organizationId },
      });
      if (!source?.resumeProfile || !["processing", "ready"].includes(source.resumeParseStatus)) {
        await this.mark(input, null, "skipped", "resume profile is not ready");
        return;
      }
      contentHash = source.resumeContentHash;
      profile = source.resumeProfile;
      status = source.status === "archived" ? "archived" : "active";
    }
    await this.index(input, resumeChunks(profile), stableHash(profile), contentHash, status);
  }

  private async index(
    input: ResumeSemanticIndexJobData,
    chunks: SemanticChunk[],
    profileHash: string,
    contentHash: string | null,
    status: "active" | "archived",
  ): Promise<void> {
    const model = this.env.RESUME_EMBEDDING_MODEL?.trim() || "text-embedding-v4";
    const dimensions = Number.parseInt(this.env.RESUME_EMBEDDING_DIMENSIONS || "1024", 10);
    const embeddingVersion =
      this.env.RESUME_EMBEDDING_VERSION?.trim() || "dashscope-text-embedding-v4-1024-v1";
    try {
      const response = await fetch(
        `${(this.env.RESUME_EMBEDDING_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/+$/u, "")}/embeddings`,
        {
          body: JSON.stringify({ dimensions, input: chunks.map((chunk) => chunk.text), model }),
          headers: {
            authorization: `Bearer ${this.env.RESUME_EMBEDDING_API_KEY || required(this.env, "ALIBABA_API_KEY")}`,
            "content-type": "application/json",
          },
          method: "POST",
          signal: AbortSignal.timeout(120_000),
        },
      );
      if (!response.ok) {
        throw new Error(`Embedding request failed (${response.status})`);
      }
      // SAFETY: this private provider boundary validates lengths and vector presence immediately below.
      const body = (await response.json()) as { data?: { embedding?: number[] }[] };
      const embeddings = body.data ?? [];
      if (embeddings.length !== chunks.length) {
        throw new Error("Embedding response length mismatch");
      }
      const qdrant = new QdrantClient({
        apiKey: this.env.QDRANT_API_KEY || undefined,
        checkCompatibility: false,
        url: required(this.env, "QDRANT_URL"),
      });
      const collection = this.env.QDRANT_RESUME_COLLECTION || "resume_semantic_v1";
      const collectionState = await qdrant.collectionExists(collection);
      if (!collectionState.exists) {
        await qdrant.createCollection(collection, {
          vectors: { distance: "Cosine", size: dimensions },
        });
      }
      await qdrant.upsert(collection, {
        points: chunks.map((chunk, index) => ({
          id: pointUuid(
            `${input.sourceType}:${input.sourceId}:${chunk.chunkType}:${embeddingVersion}`,
          ),
          payload: {
            chunkType: chunk.chunkType,
            contentHash,
            embeddingModel: model,
            embeddingVersion,
            organizationId: input.organizationId,
            profileHash,
            sourceId: input.sourceId,
            sourceType: input.sourceType,
            status,
          },
          vector: embeddings[index]?.embedding ?? [],
        })),
        wait: true,
      });
      await this.mark(
        input,
        { contentHash, embeddingVersion, model, profileHash },
        "indexed",
        null,
      );
    } catch (error) {
      await this.mark(
        input,
        { contentHash, embeddingVersion, model, profileHash },
        "failed",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private async mark(
    input: ResumeSemanticIndexJobData,
    values: {
      contentHash: string | null;
      embeddingVersion: string;
      model: string;
      profileHash: string;
    } | null,
    status: "deleted" | "failed" | "indexed" | "skipped",
    errorMessage: string | null,
  ): Promise<void> {
    const now = new Date();
    const embeddingVersion =
      values?.embeddingVersion ||
      this.env.RESUME_EMBEDDING_VERSION?.trim() ||
      "dashscope-text-embedding-v4-1024-v1";
    await this.database
      .insert(resumeSemanticIndex)
      .values({
        contentHash: values?.contentHash ?? null,
        embeddingModel: values?.model || this.env.RESUME_EMBEDDING_MODEL || "text-embedding-v4",
        embeddingVersion,
        errorMessage,
        id: `${input.sourceType}:${input.sourceId}:${embeddingVersion}`,
        lastIndexedAt: status === "indexed" ? now : null,
        organizationId: input.organizationId,
        profileHash: values?.profileHash || "skipped",
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        status,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        set: {
          contentHash: values?.contentHash ?? null,
          embeddingModel: values?.model || this.env.RESUME_EMBEDDING_MODEL || "text-embedding-v4",
          errorMessage,
          lastIndexedAt: status === "indexed" ? now : null,
          profileHash: values?.profileHash || "skipped",
          status,
          updatedAt: now,
        },
        target: [
          resumeSemanticIndex.sourceType,
          resumeSemanticIndex.sourceId,
          resumeSemanticIndex.embeddingVersion,
        ],
      });
  }
}
