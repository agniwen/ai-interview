/* oxlint-disable complexity -- Recommendation eligibility is intentionally evaluated in one pass so ranking reasons remain aligned with each candidate. */
import { BadGatewayException } from "@nestjs/common";
import { QdrantClient } from "@qdrant/js-client-rest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { department, jobDescription } from "@arc/db-schema/schema";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { WorkspaceDatabasePort } from "../workspace.ports.js";

type Chunk = "resume_overview" | "skill_role" | "work_project";

function isChunk(value: string): value is Chunk {
  return ["resume_overview", "skill_role", "work_project"].includes(value);
}
const embeddingSchema = z.object({ data: z.array(z.object({ embedding: z.array(z.number()) })) });
const pointSchema = z.object({
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
function enabled() {
  return ["1", "true", "yes"].includes(
    process.env.RESUME_SEMANTIC_INDEX_ENABLED?.trim().toLowerCase() ?? "",
  );
}
function texts(profile: ResumeProfile) {
  return [
    {
      chunkType: "resume_overview" as const,
      text: [profile.name, ...profile.targetRoles, ...profile.personalStrengths]
        .filter(Boolean)
        .join("\n"),
    },
    {
      chunkType: "skill_role" as const,
      text: [...profile.skills, ...profile.targetRoles].filter(Boolean).join("\n"),
    },
    {
      chunkType: "work_project" as const,
      text: [
        ...profile.workExperiences.map(
          (item) => `${item.company ?? ""} ${item.role ?? ""} ${item.summary ?? ""}`,
        ),
        ...profile.projectExperiences.map(
          (item) => `${item.name ?? ""} ${item.role ?? ""} ${item.summary ?? ""}`,
        ),
      ].join("\n"),
    },
  ].filter((item) => item.text.trim());
}
function weighted(scores: Partial<Record<Chunk, number>>) {
  return Math.floor(
    ((scores.skill_role ?? 0) * 0.45 +
      (scores.work_project ?? 0) * 0.35 +
      (scores.resume_overview ?? 0) * 0.2) *
      100,
  );
}

export async function recommendJobsForPoolResume(
  database: WorkspaceDatabasePort,
  input: {
    id: string;
    jobDescriptionId: string | null;
    organizationId: string;
    profile: ResumeProfile | null;
    topN: number;
  },
) {
  if (input.jobDescriptionId) {
    return {
      diagnostics: { aboveThresholdCount: 0, eligibleCount: 0, vectorHitCount: 0 },
      recommendations: [],
      resume: { id: input.id },
      status: "already_matched" as const,
    };
  }
  const apiKey =
    process.env.RESUME_EMBEDDING_API_KEY?.trim() || process.env.ALIBABA_API_KEY?.trim();
  const url = process.env.QDRANT_URL?.trim();
  if (!(enabled() && apiKey && url && input.profile)) {
    return {
      diagnostics: { aboveThresholdCount: 0, eligibleCount: 0, vectorHitCount: 0 },
      recommendations: [],
      resume: { id: input.id },
      status: "disabled" as const,
    };
  }
  const chunks = texts(input.profile);
  if (!chunks.length) {
    return {
      diagnostics: { aboveThresholdCount: 0, eligibleCount: 0, vectorHitCount: 0 },
      recommendations: [],
      resume: { id: input.id },
      status: "ready" as const,
    };
  }
  const response = await fetch(
    `${(process.env.RESUME_EMBEDDING_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "")}/embeddings`,
    {
      body: JSON.stringify({
        dimensions: Number.parseInt(process.env.RESUME_EMBEDDING_DIMENSIONS || "1024", 10),
        input: chunks.map((item) => item.text),
        model: process.env.RESUME_EMBEDDING_MODEL || "text-embedding-v4",
      }),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!response.ok) {
    throw new BadGatewayException("岗位推荐失败，请稍后重试。");
  }
  const vectors = embeddingSchema.parse(await response.json());
  const client = new QdrantClient({
    apiKey: process.env.QDRANT_API_KEY?.trim() || undefined,
    checkCompatibility: false,
    url,
  });
  const collection = process.env.QDRANT_RESUME_COLLECTION || "resume_semantic_v1";
  const groups = await Promise.all(
    chunks.map(async (chunk, index) =>
      pointSchema.parse(
        await client.query(collection, {
          filter: {
            must: [
              { key: "organizationId", match: { value: input.organizationId } },
              { key: "chunkType", match: { value: chunk.chunkType } },
              { key: "status", match: { value: "active" } },
              { key: "sourceType", match: { value: "job_description" } },
            ],
          },
          limit: 50,
          query: vectors.data[index].embedding,
          with_payload: true,
        }),
      ),
    ),
  );
  const scores = new Map<string, Partial<Record<Chunk, number>>>();
  for (const point of groups.flatMap((group) => group.points ?? [])) {
    if (
      !point.payload ||
      point.payload.sourceType !== "job_description" ||
      !isChunk(point.payload.chunkType)
    ) {
      continue;
    }
    const type = point.payload.chunkType;
    const value = scores.get(point.payload.sourceId) ?? {};
    value[type] = Math.max(value[type] ?? 0, point.score);
    scores.set(point.payload.sourceId, value);
  }
  const ranked = [...scores]
    .map(([id, value]) => ({ id, score: weighted(value), value }))
    .filter((item) => item.score >= 55)
    .toSorted((a, b) => b.score - a.score);
  const ids = ranked.map((item) => item.id);
  const jobs = ids.length
    ? await database
        .select({
          departmentName: department.name,
          description: jobDescription.prompt,
          id: jobDescription.id,
          name: jobDescription.name,
        })
        .from(jobDescription)
        .leftJoin(department, eq(department.id, jobDescription.departmentId))
        .where(
          and(
            eq(jobDescription.organizationId, input.organizationId),
            eq(jobDescription.lifecycleStatus, "published"),
            inArray(jobDescription.id, ids),
          ),
        )
    : [];
  const byId = new Map(jobs.map((item) => [item.id, item]));
  const recommendations = ranked
    .flatMap((item) => {
      const job = byId.get(item.id);
      if (!job) {
        return [];
      }
      const reasons: string[] = [];
      if (item.value.skill_role !== undefined) {
        reasons.push("技能与岗位要求相似");
      }
      if (item.value.work_project !== undefined) {
        reasons.push("职责/项目经验匹配");
      }
      if (item.value.resume_overview !== undefined) {
        reasons.push("整体画像匹配");
      }
      return [
        {
          ...job,
          description:
            job.description.length > 200 ? `${job.description.slice(0, 200)}…` : job.description,
          reasons,
          score: item.score,
          similarity: {
            resumeOverview: item.value.resume_overview,
            skillRole: item.value.skill_role,
            workProject: item.value.work_project,
          },
        },
      ];
    })
    .slice(0, input.topN);
  return {
    diagnostics: {
      aboveThresholdCount: ranked.length,
      eligibleCount: jobs.length,
      vectorHitCount: scores.size,
    },
    recommendations,
    resume: { id: input.id },
    status: "ready" as const,
  };
}
