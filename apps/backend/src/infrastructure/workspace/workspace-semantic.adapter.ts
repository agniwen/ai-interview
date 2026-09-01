import { QdrantClient } from "@qdrant/js-client-rest";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { jobDescription, studioInterview, user } from "@arc/db-schema/schema";
import { getCandidateActivityStatus } from "@arc/shared/candidate-pipeline-machine";
import type { WorkspaceResumeSemanticPort } from "../../features/workspace/workspace.ports.js";
import { API_DATABASE } from "../database/database.tokens.js";
import type { Database } from "../database/database.tokens.js";

type ChunkType = "resume_overview" | "skill_role" | "work_project";

const embeddingResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()) })),
});
const qdrantResponseSchema = z.object({
  points: z
    .array(
      z.object({
        payload: z
          .object({ chunkType: z.string(), sourceId: z.string(), sourceType: z.string() })
          .nullable(),
        score: z.number(),
      }),
    )
    .optional(),
});

function enabled(): boolean {
  return ["1", "true", "yes"].includes(
    process.env.RESUME_SEMANTIC_INDEX_ENABLED?.trim().toLowerCase() ?? "",
  );
}

function normalized(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function overlap(left: readonly string[], right: readonly string[]): number {
  const a = new Set(left.map(normalized).filter(Boolean));
  const b = new Set(right.map(normalized).filter(Boolean));
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  return [...a].filter((value) => b.has(value)).length / Math.max(a.size, b.size);
}

function chunks(profile: ResumeProfile): { chunkType: ChunkType; text: string }[] {
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
      text: JSON.stringify({
        projects: profile.projectExperiences,
        work: profile.workExperiences,
      }),
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

function matchLevel(score: number): "high" | "low" | "medium" {
  if (score >= 92) {
    return "high";
  }
  if (score >= 75) {
    return "medium";
  }
  return "low";
}

function canSearchSemantically(
  profile: ResumeProfile | null | undefined,
): profile is ResumeProfile {
  return enabled() && Boolean(profile);
}

function isChunkType(value: string): value is ChunkType {
  return ["resume_overview", "skill_role", "work_project"].includes(value);
}

function scoreMatch(
  query: ResumeProfile,
  candidate: ResumeProfile | null,
  vectorScores: Partial<Record<ChunkType, number>>,
) {
  const vectorMaximum = Math.max(...Object.values(vectorScores), 0);
  const reasons: string[] = [];
  if ((vectorScores.work_project ?? 0) >= 0.9) {
    reasons.push("工作/项目经历语义高度相似");
  }
  if ((vectorScores.resume_overview ?? 0) >= 0.88) {
    reasons.push("简历整体画像相似");
  }
  if ((vectorScores.skill_role ?? 0) >= 0.85) {
    reasons.push("技能与目标岗位相似");
  }
  let structured = 0;
  const conflicts: string[] = [];
  if (candidate) {
    const skillOverlap = overlap(query.skills, candidate.skills);
    structured += Math.min(skillOverlap, 1) * 0.25;
    if (skillOverlap >= 0.5) {
      reasons.push(`技能栈重合度 ${Math.round(skillOverlap * 100)}%`);
    }
    if (
      normalized(query.workExperiences[0]?.company) &&
      normalized(query.workExperiences[0]?.company) ===
        normalized(candidate.workExperiences[0]?.company)
    ) {
      structured += 0.5;
      reasons.push("最近工作公司一致");
    }
    if (overlap(query.schools, candidate.schools) > 0) {
      structured += 0.25;
      reasons.push("教育经历存在相同学校");
    }
    if (normalized(query.email) && normalized(query.email) !== normalized(candidate.email)) {
      conflicts.push("邮箱不同");
    }
    if (normalized(query.phone) && normalized(query.phone) !== normalized(candidate.phone)) {
      conflicts.push("手机号不同");
    }
  }
  const score = Math.min(100, Math.round(vectorMaximum * 85 + Math.min(structured, 1) * 15));
  return {
    conflictingSignals: conflicts,
    level: matchLevel(score),
    reasons: [...new Set(reasons)].slice(0, 8),
    score,
  };
}

@Injectable()
export class WorkspaceResumeSemanticAdapter implements WorkspaceResumeSemanticPort {
  constructor(@Inject(API_DATABASE) private readonly database: Database) {}

  async findDuplicates(input: {
    organizationId: string;
    resumeProfile?: ResumeProfile | null;
  }): Promise<unknown[]> {
    const { resumeProfile } = input;
    if (!canSearchSemantically(resumeProfile)) {
      return [];
    }

    const apiKey = process.env.RESUME_EMBEDDING_API_KEY || process.env.ALIBABA_API_KEY;
    const qdrantUrl = process.env.QDRANT_URL?.trim();
    if (!(apiKey && qdrantUrl)) {
      throw new Error(
        "Resume semantic search requires RESUME_EMBEDDING_API_KEY/ALIBABA_API_KEY and QDRANT_URL",
      );
    }
    const semanticChunks = chunks(resumeProfile);
    const baseUrl = (
      process.env.RESUME_EMBEDDING_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"
    ).replace(/\/+$/, "");
    const embeddingResponse = await fetch(`${baseUrl}/embeddings`, {
      body: JSON.stringify({
        dimensions: Number.parseInt(process.env.RESUME_EMBEDDING_DIMENSIONS || "1024", 10),
        input: semanticChunks.map((chunk) => chunk.text),
        model: process.env.RESUME_EMBEDDING_MODEL || "text-embedding-v4",
      }),
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      method: "POST",
    });
    if (!embeddingResponse.ok) {
      throw new Error(`Embedding request failed (${embeddingResponse.status})`);
    }
    const embedded = embeddingResponseSchema.parse(await embeddingResponse.json());
    if (embedded.data.length !== semanticChunks.length) {
      throw new Error("Embedding response length does not match semantic chunks");
    }

    const qdrant = new QdrantClient({
      apiKey: process.env.QDRANT_API_KEY || undefined,
      checkCompatibility: false,
      url: qdrantUrl,
    });
    const collection = process.env.QDRANT_RESUME_COLLECTION || "resume_semantic_v1";
    const searches = await Promise.all(
      semanticChunks.map(async (chunk, index) => {
        const embedding = embedded.data[index]?.embedding;
        if (!embedding) {
          throw new Error(`Missing embedding at index ${index}`);
        }
        const response = await qdrant.query(collection, {
          filter: {
            must: [
              { key: "organizationId", match: { value: input.organizationId } },
              { key: "chunkType", match: { value: chunk.chunkType } },
              { key: "status", match: { value: "active" } },
              { key: "sourceType", match: { value: "studio_interview" } },
            ],
          },
          limit: chunk.chunkType === "skill_role" ? 30 : 50,
          query: embedding,
          with_payload: true,
        });
        return qdrantResponseSchema.parse(response).points ?? [];
      }),
    );
    const bySource = new Map<string, Partial<Record<ChunkType, number>>>();
    for (const point of searches.flat()) {
      if (
        !point.payload ||
        point.payload.sourceType !== "studio_interview" ||
        !isChunkType(point.payload.chunkType)
      ) {
        continue;
      }
      const { chunkType } = point.payload;
      const current = bySource.get(point.payload.sourceId) ?? {};
      current[chunkType] = Math.max(current[chunkType] ?? 0, point.score);
      bySource.set(point.payload.sourceId, current);
    }
    const ids = [...bySource.keys()];
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.database
      .select({
        candidateEmail: studioInterview.candidateEmail,
        candidateName: studioInterview.candidateName,
        candidatePhone: studioInterview.candidatePhone,
        createdAt: studioInterview.createdAt,
        id: studioInterview.id,
        jobDescriptionName: jobDescription.name,
        pipelineStage: studioInterview.pipelineStage,
        resumeProfile: studioInterview.resumeProfile,
        targetRole: studioInterview.targetRole,
        uploaderImage: user.image,
        uploaderName: user.name,
      })
      .from(studioInterview)
      .leftJoin(user, eq(studioInterview.createdBy, user.id))
      .leftJoin(
        jobDescription,
        and(
          eq(studioInterview.jobDescriptionId, jobDescription.id),
          eq(jobDescription.organizationId, studioInterview.organizationId),
        ),
      )
      .where(
        and(
          eq(studioInterview.organizationId, input.organizationId),
          inArray(studioInterview.id, ids),
        ),
      );
    return rows
      .flatMap((row) => {
        const scores = bySource.get(row.id) ?? {};
        const match = scoreMatch(resumeProfile, row.resumeProfile, scores);
        if (match.level === "low") {
          return [];
        }
        return [
          {
            candidateEmail: row.candidateEmail,
            candidateName: row.candidateName,
            candidatePhone: row.candidatePhone,
            conflictingSignals: match.conflictingSignals,
            createdAt: row.createdAt.toISOString(),
            id: row.id,
            jobDescriptionName: row.jobDescriptionName,
            level: match.level,
            resumeProfileSnapshot: row.resumeProfile,
            score: match.score,
            semanticReasons: match.reasons,
            similarity: {
              resumeOverview: scores.resume_overview,
              skillRole: scores.skill_role,
              workProject: scores.work_project,
            },
            skills: (row.resumeProfile?.skills ?? []).slice(0, 12),
            sourceType: "studio_interview",
            status: getCandidateActivityStatus(row.pipelineStage),
            targetRole: row.targetRole,
            uploaderImage: row.uploaderImage,
            uploaderName: row.uploaderName,
          },
        ];
      })
      .toSorted((left, right) => right.score - left.score)
      .slice(0, 10);
  }
}
