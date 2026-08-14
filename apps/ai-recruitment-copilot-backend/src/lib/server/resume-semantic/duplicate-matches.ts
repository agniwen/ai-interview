import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { describeResumeProgress } from "@arc/shared/studio-resumes";
import {
  EMPTY_STAGE_PROGRESS,
  loadResumeStageProgress,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resume-derived-fields";
import type { DedupMatchRecord } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/studio-interviews";
import { buildResumeProfileSnapshotFromProfile } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resume-profile-snapshot";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeSemanticDuplicateLevel, ResumeSemanticSourceType } from "@arc/db-schema/schema";
import {
  jobDescription,
  resumeDuplicateMatch,
  resumePoolItem,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
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

const LEVEL_PRIORITY: Record<ResumeSemanticDuplicateLevel, number> = {
  high: 2,
  low: 0,
  medium: 1,
};

/**
 * 把「subjectId → otherId → level」行聚合成每个 subject 的重复数量与最高风险等级；
 * 同一对（otherId）只计一次，等级取该对中更高的一档。
 * Aggregates per-subject duplicate counts with pair-level dedup; the highest
 * level across the pair wins.
 */
export function aggregateDuplicateMatchCounts(
  rows: {
    level: ResumeSemanticDuplicateLevel;
    otherId: string;
    subjectId: string;
  }[],
): Map<string, { count: number; highestLevel: ResumeSemanticDuplicateLevel | null }> {
  const othersBySubject = new Map<string, Map<string, ResumeSemanticDuplicateLevel>>();
  for (const row of rows) {
    if (row.otherId === row.subjectId) {
      continue;
    }
    const others =
      othersBySubject.get(row.subjectId) ?? new Map<string, ResumeSemanticDuplicateLevel>();
    const existing = others.get(row.otherId);
    if (existing === undefined || LEVEL_PRIORITY[row.level] > LEVEL_PRIORITY[existing]) {
      others.set(row.otherId, row.level);
    }
    othersBySubject.set(row.subjectId, others);
  }

  const result = new Map<
    string,
    {
      count: number;
      highestLevel: ResumeSemanticDuplicateLevel | null;
    }
  >();
  for (const [subjectId, others] of othersBySubject) {
    let highestLevel: ResumeSemanticDuplicateLevel | null = null;
    for (const level of others.values()) {
      if (highestLevel === null || LEVEL_PRIORITY[level] > LEVEL_PRIORITY[highestLevel]) {
        highestLevel = level;
      }
    }
    result.set(subjectId, { count: others.size, highestLevel });
  }
  return result;
}

export async function listActiveDuplicateMatchCounts(input: {
  organizationId: string;
  sourceType: ResumeSemanticSourceType;
  sourceIds: string[];
}): Promise<Map<string, { count: number; highestLevel: ResumeSemanticDuplicateLevel | null }>> {
  if (input.sourceIds.length === 0) {
    return new Map();
  }
  // 双向计数：一条查重行会对两个 subject 各贡献一次——source 侧记录看到
  // 「早于它上传的重复」，matched 侧记录看到「后来上传、把它判为重复的份」，
  // 这样第一份简历也能看到后面上传的重复份。聚合层再按对去重。
  // A dedup row contributes to both subjects: the source side sees an earlier
  // duplicate; the matched side sees a later upload that flagged it. The
  // aggregator dedupes per pair.
  const [sourceSideRows, matchedSideRows] = await Promise.all([
    db
      .select({
        level: resumeDuplicateMatch.level,
        otherId: resumeDuplicateMatch.matchedSourceId,
        subjectId: resumeDuplicateMatch.sourceId,
      })
      .from(resumeDuplicateMatch)
      .where(
        and(
          eq(resumeDuplicateMatch.organizationId, input.organizationId),
          eq(resumeDuplicateMatch.sourceType, input.sourceType),
          inArray(resumeDuplicateMatch.sourceId, input.sourceIds),
          inArray(resumeDuplicateMatch.status, ["active", "confirmed"]),
        ),
      ),
    db
      .select({
        level: resumeDuplicateMatch.level,
        otherId: resumeDuplicateMatch.sourceId,
        subjectId: resumeDuplicateMatch.matchedSourceId,
      })
      .from(resumeDuplicateMatch)
      .where(
        and(
          eq(resumeDuplicateMatch.organizationId, input.organizationId),
          eq(resumeDuplicateMatch.matchedSourceType, input.sourceType),
          inArray(resumeDuplicateMatch.matchedSourceId, input.sourceIds),
          inArray(resumeDuplicateMatch.status, ["active", "confirmed"]),
        ),
      ),
  ]);

  return aggregateDuplicateMatchCounts([
    ...sourceSideRows.map((row) => ({
      level: row.level,
      otherId: row.otherId,
      subjectId: row.subjectId,
    })),
    ...matchedSideRows.map((row) => ({
      level: row.level,
      otherId: row.otherId,
      subjectId: row.subjectId,
    })),
  ]);
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

interface PipelineStatus {
  label: string;
  tone: "success" | "warning" | "info" | "outline";
}

type MatchRowDirection = Pick<
  DuplicateMatchRow,
  "matchedSourceId" | "matchedSourceType" | "sourceId" | "sourceType"
>;

export interface ResolvedDuplicateMatch<T> {
  otherId: string;
  otherType: ResumeSemanticSourceType;
  row: T;
}

/**
 * 把查重行解析为以 subject 为中心的匹配：subject 既可以是行的 source
 * （早于它上传的重复），也可以是行的 matched（晚于它、把 subject 判为重复的记录）。
 * 同一对（otherType:otherId）只保留一行。
 * Resolves dedup rows around a subject record — the subject may be the row's
 * source (earlier duplicates) or its matched side (later uploads that flagged
 * it as a duplicate). Pairs are deduplicated to one row.
 */
export function resolveDuplicateMatchRows<T extends MatchRowDirection>(
  subjectId: string,
  rows: T[],
): ResolvedDuplicateMatch<T>[] {
  const seen = new Set<string>();
  const resolved: ResolvedDuplicateMatch<T>[] = [];
  for (const row of rows) {
    if (row.sourceId !== subjectId && row.matchedSourceId !== subjectId) {
      continue;
    }
    const isSourceSide = row.sourceId === subjectId;
    const otherType = isSourceSide ? row.matchedSourceType : row.sourceType;
    const otherId = isSourceSide ? row.matchedSourceId : row.sourceId;
    if (otherId === subjectId) {
      continue;
    }
    const key = `${otherType}:${otherId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    resolved.push({ otherId, otherType, row });
  }
  return resolved;
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
    pipelineStatus: PipelineStatus | null;
    resumeFileName: string | null;
    resumeProfile: ResumeProfile | null;
    status: DedupMatchRecord["status"];
    targetRole: string | null;
    uploaderImage: string | null;
    uploaderName: string | null;
  },
  matchSourceType: ResumeSemanticSourceType,
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
    pipelineStatus: target.pipelineStatus,
    resumeFileName: target.resumeFileName,
    resumeProfileSnapshot: buildResumeProfileSnapshotFromProfile(target.resumeProfile),
    score: match.score,
    semanticReasons: match.reasons,
    similarity: match.similarity ?? undefined,
    skills: profileSkills(target.resumeProfile),
    sourceType: matchSourceType,
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
        inArray(resumeDuplicateMatch.status, ["active", "confirmed"]),
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
    .orderBy(desc(resumeDuplicateMatch.score), desc(resumeDuplicateMatch.createdAt));

  // 双向解析：source 侧命中早于本记录的重复，matched 侧命中后来上传、
  // 把本记录判为重复的记录（即第一份也能看到后面上传的重复份）。
  // Bidirectional: the source side is an earlier duplicate; the matched side
  // is a later upload that flagged this record as its duplicate.
  const resolvedMatches = resolveDuplicateMatchRows(input.sourceId, matchRows);
  const studioIds = resolvedMatches.flatMap((match) =>
    match.otherType === "studio_interview" ? [match.otherId] : [],
  );
  const poolIds = resolvedMatches.flatMap((match) =>
    match.otherType === "resume_pool_item" ? [match.otherId] : [],
  );

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
            outcome: studioInterview.outcome,
            pipelineStage: studioInterview.pipelineStage,
            resumeFileName: studioInterview.resumeFileName,
            resumeParseStatus: studioInterview.resumeParseStatus,
            resumeProfile: studioInterview.resumeProfile,
            resumeReviewStatus: studioInterview.resumeReviewStatus,
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

  // 招聘台匹配记录附带当前招聘状态（与招聘台卡片 badge 同一套 describeResumeProgress 文案）。
  // Attach the current recruiting status to studio matches — same single source
  // of truth (describeResumeProgress) as the resume library lifecycle badge.
  const stageProgressById = await loadResumeStageProgress(studioIds);
  const targets = new Map<string, Parameters<typeof toMatchRecord>[1]>([
    ...studioRows.map((row): [string, Parameters<typeof toMatchRecord>[1]] => [
      `studio_interview:${row.id}`,
      {
        ...row,
        pipelineStatus: describeResumeProgress({
          outcome: row.outcome,
          pipelineStage: row.pipelineStage,
          resumeParseStatus: row.resumeParseStatus,
          resumeReviewStatus: row.resumeReviewStatus,
          stageProgress: stageProgressById.get(row.id)?.stageProgress ?? EMPTY_STAGE_PROGRESS,
        }),
      },
    ]),
    ...poolRows.map((row): [string, Parameters<typeof toMatchRecord>[1]] => [
      `resume_pool_item:${row.id}`,
      { ...row, pipelineStatus: null },
    ]),
  ]);

  return resolvedMatches
    .map(({ otherId, otherType, row }) => {
      const target = targets.get(`${otherType}:${otherId}`);
      return target ? toMatchRecord(row, target, otherType) : null;
    })
    .filter((match): match is DedupMatchRecord => match !== null);
}
