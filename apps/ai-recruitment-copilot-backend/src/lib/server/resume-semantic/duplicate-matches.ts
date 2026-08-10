import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import type { DedupMatchRecord } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/studio-interviews";
import { buildResumeProfileSnapshotFromProfile } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resume-profile-snapshot";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import {
  jobDescription,
  resumeDuplicateMatch,
  resumePoolItem,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import type { ResumeSemanticSourceType } from "@arc/db-schema/schema";
import { getResumeSemanticIndexConfig } from "./indexer";

export interface PersistDuplicateMatchesInput {
  organizationId: string;
  sourceType: ResumeSemanticSourceType;
  sourceId: string;
  matches: DedupMatchRecord[];
  embeddingVersion?: string;
}

export function toDuplicateMatchInsertRows(input: Required<PersistDuplicateMatchesInput>) {
  return input.matches.map((match) => ({
    embeddingVersion: input.embeddingVersion,
    id: crypto.randomUUID(),
    level: match.level ?? "medium",
    matchedSourceId: match.id,
    matchedSourceType: match.sourceType ?? "studio_interview",
    organizationId: input.organizationId,
    reasons: match.semanticReasons ?? [],
    score: Math.round(match.score ?? 0),
    signals: match.conflictingSignals ?? [],
    similarity: match.similarity ?? null,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    status: "active" as const,
  }));
}

export async function replaceDuplicateMatchesForSource(
  input: PersistDuplicateMatchesInput,
): Promise<number> {
  const embeddingVersion =
    input.embeddingVersion ?? getResumeSemanticIndexConfig().embeddingVersion;
  await db
    .delete(resumeDuplicateMatch)
    .where(
      and(
        eq(resumeDuplicateMatch.organizationId, input.organizationId),
        eq(resumeDuplicateMatch.sourceType, input.sourceType),
        eq(resumeDuplicateMatch.sourceId, input.sourceId),
        eq(resumeDuplicateMatch.embeddingVersion, embeddingVersion),
        eq(resumeDuplicateMatch.status, "active"),
      ),
    );

  if (input.matches.length === 0) {
    return 0;
  }

  const rows = toDuplicateMatchInsertRows({ ...input, embeddingVersion });
  await db
    .insert(resumeDuplicateMatch)
    .values(rows)
    .onConflictDoUpdate({
      set: {
        level: sql`excluded.level`,
        reasons: sql`excluded.reasons`,
        score: sql`excluded.score`,
        signals: sql`excluded.signals`,
        similarity: sql`excluded.similarity`,
        status: "active",
        updatedAt: new Date(),
      },
      target: [
        resumeDuplicateMatch.organizationId,
        resumeDuplicateMatch.sourceType,
        resumeDuplicateMatch.sourceId,
        resumeDuplicateMatch.matchedSourceType,
        resumeDuplicateMatch.matchedSourceId,
        resumeDuplicateMatch.embeddingVersion,
      ],
    });
  return rows.length;
}

export async function deleteDuplicateMatchesForSource(input: {
  organizationId: string;
  sourceId: string;
  sourceType: ResumeSemanticSourceType;
}): Promise<number> {
  const deleted = await db
    .delete(resumeDuplicateMatch)
    .where(
      and(
        eq(resumeDuplicateMatch.organizationId, input.organizationId),
        or(
          and(
            eq(resumeDuplicateMatch.sourceType, input.sourceType),
            eq(resumeDuplicateMatch.sourceId, input.sourceId),
          ),
          and(
            eq(resumeDuplicateMatch.matchedSourceType, input.sourceType),
            eq(resumeDuplicateMatch.matchedSourceId, input.sourceId),
          ),
        ),
      ),
    )
    .returning({ id: resumeDuplicateMatch.id });

  return deleted.length;
}

export async function listActiveDuplicateMatchCounts(input: {
  organizationId: string;
  sourceType: ResumeSemanticSourceType;
  sourceIds: string[];
}): Promise<Map<string, { count: number; highestLevel: "high" | "low" | "medium" | null }>> {
  if (input.sourceIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
      highestLevel: sql<"high" | "low" | "medium" | null>`
        CASE
          WHEN bool_or(${resumeDuplicateMatch.level} = 'high') THEN 'high'
          WHEN bool_or(${resumeDuplicateMatch.level} = 'medium') THEN 'medium'
          WHEN bool_or(${resumeDuplicateMatch.level} = 'low') THEN 'low'
          ELSE NULL
        END
      `,
      sourceId: resumeDuplicateMatch.sourceId,
    })
    .from(resumeDuplicateMatch)
    .where(
      and(
        eq(resumeDuplicateMatch.organizationId, input.organizationId),
        eq(resumeDuplicateMatch.sourceType, input.sourceType),
        inArray(resumeDuplicateMatch.sourceId, input.sourceIds),
        inArray(resumeDuplicateMatch.status, ["active", "confirmed"]),
      ),
    )
    .groupBy(resumeDuplicateMatch.sourceId);

  return new Map(rows.map((row) => [row.sourceId, row]));
}

type DuplicateMatchRow = typeof resumeDuplicateMatch.$inferSelect;

const DEDUP_SKILLS_LIMIT = 12;

function profileSkills(profile: ResumeProfile | null | undefined): string[] {
  if (!profile?.skills?.length) {
    return [];
  }
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const raw of profile.skills) {
    const skill = raw?.trim();
    if (!skill || skill === "未发现信息" || seen.has(skill)) {
      continue;
    }
    seen.add(skill);
    skills.push(skill);
    if (skills.length >= DEDUP_SKILLS_LIMIT) {
      break;
    }
  }
  return skills;
}

function toMatchRecord(
  match: DuplicateMatchRow,
  target: {
    candidateEmail: string | null;
    candidateName: string;
    candidatePhone: string | null;
    createdAt: Date;
    id: string;
    jobDescriptionName: string | null;
    resumeFileName: string | null;
    resumeProfile: ResumeProfile | null;
    status: DedupMatchRecord["status"];
    targetRole: string | null;
    uploaderImage: string | null;
    uploaderName: string | null;
  },
): DedupMatchRecord {
  return {
    candidateEmail: target.candidateEmail,
    candidateName: target.candidateName,
    candidatePhone: target.candidatePhone,
    conflictingSignals: match.signals,
    createdAt: target.createdAt.toISOString(),
    id: target.id,
    jobDescriptionName: target.jobDescriptionName,
    level: match.level,
    resumeFileName: target.resumeFileName,
    resumeProfileSnapshot: buildResumeProfileSnapshotFromProfile(target.resumeProfile),
    score: match.score,
    semanticReasons: match.reasons,
    similarity: match.similarity ?? undefined,
    skills: profileSkills(target.resumeProfile),
    sourceType: match.matchedSourceType,
    status: target.status,
    targetRole: target.targetRole,
    uploaderImage: target.uploaderImage,
    uploaderName: target.uploaderName,
  };
}

export async function listDuplicateMatchesForSource(input: {
  organizationId: string;
  sourceId: string;
  sourceType: ResumeSemanticSourceType;
}): Promise<DedupMatchRecord[]> {
  // 查重列表忽略可见范围 / 私有简历归属过滤（产品决策：查重查看忽略权限配置）。
  // 只要查重记录属于当前组织，就返回其匹配记录（含详情对照所需的全部字段）；
  // 组织边界仍由 resumeDuplicateMatch.organizationId 与下面的 join 条件保证。
  // The dedup list ignores the recruiting visibility scope and pool-item
  // ownership — any match persisted for this organization is returned, so
  // the list stays consistent with the permission-free comparison detail.
  const matchRows = await db
    .select()
    .from(resumeDuplicateMatch)
    .where(
      and(
        eq(resumeDuplicateMatch.organizationId, input.organizationId),
        eq(resumeDuplicateMatch.sourceType, input.sourceType),
        eq(resumeDuplicateMatch.sourceId, input.sourceId),
        inArray(resumeDuplicateMatch.status, ["active", "confirmed"]),
      ),
    )
    .orderBy(desc(resumeDuplicateMatch.score), desc(resumeDuplicateMatch.createdAt));

  const studioIds = matchRows
    .filter((row) => row.matchedSourceType === "studio_interview")
    .map((row) => row.matchedSourceId);
  const poolIds = matchRows
    .filter((row) => row.matchedSourceType === "resume_pool_item")
    .map((row) => row.matchedSourceId);

  const [studioRows, poolRows] = await Promise.all([
    studioIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            candidateEmail: studioInterview.candidateEmail,
            candidateName: studioInterview.candidateName,
            candidatePhone: studioInterview.candidatePhone,
            createdAt: studioInterview.createdAt,
            id: studioInterview.id,
            jobDescriptionName: jobDescription.name,
            resumeFileName: studioInterview.resumeFileName,
            resumeProfile: studioInterview.resumeProfile,
            status: sql<"active" | "archived">`
              CASE
                WHEN ${studioInterview.pipelineStage} = 'closed' THEN 'archived'
                ELSE 'active'
              END
            `,
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
              inArray(studioInterview.id, studioIds),
            ),
          ),
    poolIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            candidateEmail: resumePoolItem.candidateEmail,
            candidateName: resumePoolItem.candidateName,
            candidatePhone: resumePoolItem.candidatePhone,
            createdAt: resumePoolItem.createdAt,
            id: resumePoolItem.id,
            jobDescriptionName: jobDescription.name,
            resumeFileName: resumePoolItem.resumeFileName,
            resumeProfile: resumePoolItem.resumeProfile,
            status: resumePoolItem.status,
            targetRole: resumePoolItem.targetRole,
            uploaderImage: user.image,
            uploaderName: user.name,
          })
          .from(resumePoolItem)
          .leftJoin(user, eq(resumePoolItem.createdBy, user.id))
          .leftJoin(
            jobDescription,
            and(
              eq(resumePoolItem.jobDescriptionId, jobDescription.id),
              eq(jobDescription.organizationId, resumePoolItem.organizationId),
            ),
          )
          .where(
            and(
              inArray(resumePoolItem.id, poolIds),
              eq(resumePoolItem.status, "active"),
              eq(resumePoolItem.organizationId, input.organizationId),
            ),
          ),
  ]);

  const targets = new Map<string, Parameters<typeof toMatchRecord>[1]>([
    ...studioRows.map((row) => [`studio_interview:${row.id}`, row] as const),
    ...poolRows.map((row) => [`resume_pool_item:${row.id}`, row] as const),
  ]);

  return matchRows
    .map((match) => {
      const target = targets.get(`${match.matchedSourceType}:${match.matchedSourceId}`);
      return target ? toMatchRecord(match, target) : null;
    })
    .filter((match): match is DedupMatchRecord => match !== null);
}
