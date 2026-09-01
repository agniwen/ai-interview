/* oxlint-disable complexity, anti-slop/require-safety-comment-for-type-assertion -- Candidate eligibility, Qdrant score aggregation, and persisted resume projection form one access-filtered recommendation operation. */
import { BadGatewayException } from "@nestjs/common";
import { QdrantClient } from "@qdrant/js-client-rest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { jobDescription, studioInterview } from "@arc/db-schema/schema";
import {
  formatResumeEducationItems,
  formatResumeEducationLines,
} from "@arc/shared/resume-education";
import type { JobDescriptionTalentRecommendationResult } from "@arc/shared/job-descriptions";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { WorkspaceDatabasePort } from "../workspace.ports.js";

type ChunkType = "resume_overview" | "skill_role" | "work_project";
type Scores = Partial<Record<ChunkType, number>>;
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

function enabled() {
  return ["1", "true", "yes"].includes(
    process.env.RESUME_SEMANTIC_INDEX_ENABLED?.trim().toLowerCase() ?? "",
  );
}
function score(scores: Scores) {
  return Math.floor(
    ((scores.skill_role ?? 0) * 0.45 +
      (scores.work_project ?? 0) * 0.35 +
      (scores.resume_overview ?? 0) * 0.2) *
      100,
  );
}
function clean(value: string | null | undefined) {
  const text = value?.trim();
  return !text || text === "未发现信息" ? null : text;
}
function periodRank(value: string | null) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  if (/(至今|现在|目前|present|current)/iu.test(value)) {
    return Number.POSITIVE_INFINITY;
  }
  const values = [...value.matchAll(/(\d{4})\s*[./年-]\s*(\d{1,2})/gu)].map(
    ([, year, month]) => Number(year) * 12 + Number(month),
  );
  return values.at(-1) ?? Number.NEGATIVE_INFINITY;
}
function latest<T extends { period: string | null }>(
  items: T[],
  name: (item: T) => string | null | undefined,
) {
  return items
    .filter((item) => clean(name(item)))
    .toSorted((left, right) => periodRank(right.period) - periodRank(left.period))[0];
}
function highlights(profile: ResumeProfile | null) {
  if (!profile) {
    return {
      educationItems: [],
      educationLines: [],
      latestCompany: null,
      latestCompanyDetail: null,
      latestProject: null,
      latestProjectDetail: null,
      personalStrengths: [],
      schools: [],
    };
  }
  const work = latest(profile.workExperiences, (item) => item.company);
  const project = latest(profile.projectExperiences, (item) => item.name);
  return {
    educationItems: formatResumeEducationItems(profile.educationExperiences),
    educationLines: formatResumeEducationLines(profile.educationExperiences),
    latestCompany: clean(work?.company),
    latestCompanyDetail: work
      ? { period: clean(work.period), role: clean(work.role), summary: clean(work.summary) }
      : null,
    latestProject: clean(project?.name),
    latestProjectDetail: project
      ? {
          period: clean(project.period),
          role: clean(project.role),
          summary: clean(project.summary),
        }
      : null,
    personalStrengths: profile.personalStrengths
      .map(clean)
      .filter((item): item is string => Boolean(item)),
    schools: profile.schools.map(clean).filter((item): item is string => Boolean(item)),
  };
}
function reasons(profile: ResumeProfile | null, scores: Scores, prompt: string) {
  const result: string[] = [];
  if ((scores.skill_role ?? 0) >= 0.78) {
    result.push("技能与岗位要求相似");
  }
  if ((scores.work_project ?? 0) >= 0.75) {
    result.push("项目/职责经验匹配");
  }
  if ((scores.resume_overview ?? 0) >= 0.72) {
    result.push("候选人整体画像匹配");
  }
  const promptText = prompt.toLowerCase();
  const matched = (profile?.skills ?? [])
    .filter((skill) => promptText.includes(skill.trim().toLowerCase()))
    .slice(0, 3);
  if (matched.length) {
    result.push(`命中技能：${matched.join("、")}`);
  }
  return result.slice(0, 4);
}

export async function recommendJobCandidates(
  database: WorkspaceDatabasePort,
  input: {
    excludeAlreadyLinked: boolean;
    job: { id: string; name: string; prompt: string };
    limit: number;
    organizationId: string;
  },
): Promise<JobDescriptionTalentRecommendationResult> {
  const apiKey =
    process.env.RESUME_EMBEDDING_API_KEY?.trim() || process.env.ALIBABA_API_KEY?.trim();
  const qdrantUrl = process.env.QDRANT_URL?.trim();
  if (!(enabled() && apiKey && qdrantUrl)) {
    return {
      candidates: [],
      diagnostics: { vectorHitCount: 0 },
      jobDescription: { id: input.job.id, name: input.job.name },
      status: "disabled",
    };
  }
  const chunks: { chunkType: ChunkType; text: string }[] = [
    {
      chunkType: "resume_overview",
      text: `## 岗位概览\n岗位名称：${input.job.name}\n岗位 JD：${input.job.prompt}`,
    },
    { chunkType: "work_project", text: `## 职责和业务场景\n岗位 JD：${input.job.prompt}` },
    {
      chunkType: "skill_role",
      text: `## 岗位和技能要求\n目标岗位：${input.job.name}\n能力要求：${input.job.prompt}`,
    },
  ];
  const response = await fetch(
    `${(process.env.RESUME_EMBEDDING_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "")}/embeddings`,
    {
      body: JSON.stringify({
        dimensions: Number.parseInt(process.env.RESUME_EMBEDDING_DIMENSIONS || "1024", 10),
        input: chunks.map((chunk) => chunk.text),
        model: process.env.RESUME_EMBEDDING_MODEL || "text-embedding-v4",
      }),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!response.ok) {
    throw new BadGatewayException("人才推荐失败，请稍后重试。", {
      errorCode: "RESUME_EMBEDDING_REQUEST_FAILED",
    });
  }
  const embedded = embeddingResponseSchema.parse(await response.json());
  if (embedded.data.length !== chunks.length) {
    throw new BadGatewayException("人才推荐失败，请稍后重试。", {
      errorCode: "RESUME_EMBEDDING_INVALID_RESPONSE",
    });
  }
  const qdrant = new QdrantClient({
    apiKey: process.env.QDRANT_API_KEY?.trim() || undefined,
    checkCompatibility: false,
    url: qdrantUrl,
  });
  const collection = process.env.QDRANT_RESUME_COLLECTION || "resume_semantic_v1";
  await qdrant.getCollection(collection);
  const groups = await Promise.all(
    chunks.map(async (chunk, index) =>
      qdrantResponseSchema.parse(
        await qdrant.query(collection, {
          filter: {
            must: [
              { key: "organizationId", match: { value: input.organizationId } },
              { key: "chunkType", match: { value: chunk.chunkType } },
              { key: "status", match: { value: "active" } },
              { key: "sourceType", match: { value: "studio_interview" } },
            ],
          },
          limit: chunk.chunkType === "resume_overview" ? 40 : 50,
          query: embedded.data[index].embedding,
          with_payload: true,
        }),
      ),
    ),
  );
  const byId = new Map<string, Scores>();
  for (const point of groups.flatMap((group) => group.points ?? [])) {
    if (
      !point.payload ||
      point.payload.sourceType !== "studio_interview" ||
      !["resume_overview", "skill_role", "work_project"].includes(point.payload.chunkType)
    ) {
      continue;
    }
    const type = point.payload.chunkType as ChunkType;
    const scores = byId.get(point.payload.sourceId) ?? {};
    scores[type] = Math.max(scores[type] ?? 0, point.score);
    byId.set(point.payload.sourceId, scores);
  }
  const ids = [...byId.keys()];
  const candidates = ids.length
    ? await database
        .select({
          candidateEmail: studioInterview.candidateEmail,
          candidateName: studioInterview.candidateName,
          candidatePhone: studioInterview.candidatePhone,
          createdAt: studioInterview.createdAt,
          currentJobDescriptionId: studioInterview.jobDescriptionId,
          currentJobDescriptionName: jobDescription.name,
          id: studioInterview.id,
          notes: studioInterview.notes,
          resumeFileName: studioInterview.resumeFileName,
          resumeParseStatus: studioInterview.resumeParseStatus,
          resumeProfile: studioInterview.resumeProfile,
          targetRole: studioInterview.targetRole,
        })
        .from(studioInterview)
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
            ne(studioInterview.pipelineStage, "closed"),
          ),
        )
    : [];
  const ranked = candidates
    .filter(
      (candidate) =>
        !(input.excludeAlreadyLinked && candidate.currentJobDescriptionId === input.job.id),
    )
    .map((candidate) => ({ candidate, scores: byId.get(candidate.id) ?? {} }))
    .filter((entry) => score(entry.scores) >= 55)
    .toSorted((left, right) => score(right.scores) - score(left.scores))
    .slice(0, input.limit);
  return {
    candidates: ranked.map(({ candidate, scores }) => ({
      candidateEmail: candidate.candidateEmail,
      candidateName: candidate.candidateName,
      candidatePhone: candidate.candidatePhone,
      createdAt: candidate.createdAt.toISOString(),
      currentJobDescriptionId: candidate.currentJobDescriptionId,
      currentJobDescriptionName: candidate.currentJobDescriptionName,
      id: candidate.id,
      masteredSkills: [
        ...new Set(
          (candidate.resumeProfile?.skills ?? []).map((skill) => skill.trim()).filter(Boolean),
        ),
      ],
      notes: candidate.notes,
      profileHighlights: highlights(candidate.resumeProfile),
      reasons: reasons(candidate.resumeProfile, scores, input.job.prompt),
      resumeFileName: candidate.resumeFileName,
      resumeParseStatus: candidate.resumeParseStatus,
      score: score(scores),
      similarity: {
        resumeOverview: scores.resume_overview,
        skillRole: scores.skill_role,
        workProject: scores.work_project,
      },
      targetRole: candidate.targetRole ?? candidate.resumeProfile?.targetRoles?.[0] ?? null,
      workYears: candidate.resumeProfile?.workYears ?? null,
    })),
    diagnostics: { vectorHitCount: byId.size },
    jobDescription: { id: input.job.id, name: input.job.name },
    status: "ready",
  };
}
