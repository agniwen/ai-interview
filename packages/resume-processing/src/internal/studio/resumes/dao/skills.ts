import { updateRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../../../lib/db";
import { studioOrgSkill } from "@app/db-schema/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface NormalizedSkillEntry {
  display: string;
  normalized: string;
}

/**
 * 技能归一化：trim + 连续空白折叠为单空格 + lowercase。
 * 「React」/「react」/「  React  」/「Claude  Code」 → 「react」/「claude code」。
 * display 保留 trim + 空白折叠的原始大小写形式，用于 UI 展示（存在 studio_org_skill 表里）。
 *
 * Skill normalization: trim, collapse whitespace, lowercase.
 * Display keeps the trimmed + space-collapsed original casing — stored once
 * per org in studio_org_skill rather than duplicated per candidate.
 */
export function normalizeSkill(raw: string): NormalizedSkillEntry {
  const display = raw.trim().replaceAll(/\s+/g, " ");
  return { display, normalized: display.toLowerCase() };
}

function collectNormalizedSkills(
  skills: readonly string[] | null | undefined,
): NormalizedSkillEntry[] {
  if (!skills || skills.length === 0) {
    return [];
  }
  const seen = new Map<string, string>();
  for (const raw of skills) {
    const { normalized, display } = normalizeSkill(raw);
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }
    seen.set(normalized, display);
  }
  return Array.from(seen, ([normalized, display]) => ({ display, normalized }));
}

/** 更新新简历上的派生技能；旧 canonical 计数仅作为历史标签保留，禁止回写。 */
export async function syncResumeSkills(
  tx: Tx,
  params: {
    interviewId: string;
    organizationId: string;
    skills: readonly string[] | null | undefined;
  },
): Promise<void> {
  await updateRecruitingRecords(
    tx,
    and(
      eq(recruitingRecordReadModel.id, params.interviewId),
      eq(recruitingRecordReadModel.organizationId, params.organizationId),
    ),
    {
      skillsNormalized: collectNormalizedSkills(params.skills).map((entry) => entry.normalized),
    },
  );
}

/** 计数实时聚合新招聘记录，创建、改简历和删除都无需旧表触发器。旧 canonical 只提供展示大小写。 */
export function listOrgSkillSuggestions(
  organizationId: string,
  options: { prefix?: string; limit?: number } = {},
): Promise<{ skill: string; count: number }[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const prefix = options.prefix?.trim().toLowerCase();
  const normalized = sql<string>`recruiting_skill.normalized`;
  const count = sql<number>`count(DISTINCT ${recruitingRecordReadModel.id})::integer`;
  const skill = sql<string>`coalesce(${studioOrgSkill.display}, ${normalized})`;
  return db
    .select({ count, skill })
    .from(recruitingRecordReadModel)
    .innerJoin(
      sql`LATERAL unnest(${recruitingRecordReadModel.skillsNormalized}) AS recruiting_skill(normalized)`,
      sql`true`,
    )
    .leftJoin(
      studioOrgSkill,
      and(
        eq(studioOrgSkill.organizationId, organizationId),
        eq(studioOrgSkill.normalized, normalized),
      ),
    )
    .where(
      and(
        eq(recruitingRecordReadModel.organizationId, organizationId),
        prefix ? sql`${normalized} LIKE ${`${prefix.replaceAll(/[\\%_]/g, "\\$&")}%`}` : undefined,
      ),
    )
    .groupBy(normalized, studioOrgSkill.display)
    .orderBy(desc(count), asc(normalized))
    .limit(limit);
}
