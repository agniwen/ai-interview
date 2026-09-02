import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../../lib/db";
import { studioInterview, studioOrgSkill } from "@app/db-schema/schema";

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

/**
 * 重刷某条简历的技能：
 * 1. 把归一化数组写到 studio_interview.skills_normalized
 * 2. 对 canonical 表 (studio_org_skill) 做增量计数：新增技能 +1，去掉的技能 -1
 *
 * 真相在 studio_interview.resume_profile JSONB；此函数把 candidate 行上的派生数组
 * + per-org canonical 表同时跟它对齐。
 *
 * Must run inside a transaction that also writes resume_profile.
 *
 * Sync the derived skill state for one resume:
 *   1. Overwrite the candidate row's skills_normalized text[] column
 *   2. Apply delta counts to the per-org canonical table (UPSERT for added,
 *      DECR for removed)
 *
 * The JSONB column is the source of truth; this function keeps the candidate's
 * array column and the per-org canonical table in sync with it. Must run
 * inside the same transaction as the resume_profile write.
 */
export async function syncResumeSkills(
  tx: Tx,
  params: {
    interviewId: string;
    organizationId: string;
    skills: readonly string[] | null | undefined;
  },
): Promise<void> {
  const entries = collectNormalizedSkills(params.skills);
  const nextNormalized = entries.map((e) => e.normalized);

  // 读旧的归一化数组，再做差集。空集 / null 都视为「现在啥都没有」。
  // Read the old normalized array to compute the diff. null/missing rows are
  // treated as "nothing currently set".
  const [current] = await tx
    .select({ skills: studioInterview.skillsNormalized })
    .from(studioInterview)
    .where(eq(studioInterview.id, params.interviewId));

  const previous = new Set<string>(current ? current.skills : []);
  const incoming = new Set(nextNormalized);

  const added = entries.filter((e) => !previous.has(e.normalized));
  const removed = [...previous].filter((s) => !incoming.has(s));

  // 总是 UPDATE 候选人行（即便 diff 为空也无妨；让本次 sync 的 updatedAt 保持新鲜）。
  // Always UPDATE the candidate row — keeps updatedAt fresh even on a no-op sync.
  await tx
    .update(studioInterview)
    .set({ skillsNormalized: nextNormalized })
    .where(eq(studioInterview.id, params.interviewId));

  // 加上来的技能：批量 UPSERT，存在则 +1，不存在则插入 count=1。display 字段保留先到者。
  // Added skills: batch UPSERT — incr if present, insert with count=1 otherwise.
  // The display column is "first-write wins" so it doesn't churn on every sync.
  if (added.length > 0) {
    await tx
      .insert(studioOrgSkill)
      .values(
        added.map((entry) => ({
          candidateCount: 1,
          display: entry.display,
          normalized: entry.normalized,
          organizationId: params.organizationId,
        })),
      )
      .onConflictDoUpdate({
        set: {
          candidateCount: sql`${studioOrgSkill.candidateCount} + 1`,
          updatedAt: sql`now()`,
        },
        target: [studioOrgSkill.organizationId, studioOrgSkill.normalized],
      });
  }

  // 去掉的技能：DECR。GREATEST 防御性下界（理论上不会到 0 以下）。
  // Removed skills: DECR, clamped to 0 defensively (shouldn't underflow if
  // writes are correct, but cheap insurance against future bugs).
  if (removed.length > 0) {
    await tx
      .update(studioOrgSkill)
      .set({
        candidateCount: sql`GREATEST(${studioOrgSkill.candidateCount} - 1, 0)`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(studioOrgSkill.organizationId, params.organizationId),
          inArray(studioOrgSkill.normalized, removed),
        ),
      );
  }
}

/**
 * 按候选人计数倒序返回组织内的技能列表，供前端自动补全使用。
 * 返回 display 形态（per-org 单点保存的原始大小写），count 直接来自计数器（O(1) 查询）。
 *
 * Return skills sorted by candidate count desc. `skill` is the per-org display
 * form; `count` is the maintained counter on studio_org_skill, so this is a
 * simple indexed SELECT — no GROUP BY / mode() required.
 */
export async function listOrgSkillSuggestions(
  organizationId: string,
  options: { prefix?: string; limit?: number } = {},
): Promise<{ skill: string; count: number }[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  // 用户输入也归一化后做前缀匹配，避免「Re」匹配不到归一后的「react」。
  // Normalize the user prefix the same way so "Re" matches stored "react".
  const prefix = options.prefix?.trim().toLowerCase();

  const conditions = [
    eq(studioOrgSkill.organizationId, organizationId),
    // 不显示没人具备的技能（candidate_count 可能因 DECR 留下零计数行）。
    // Hide skills with no current candidates (rows may linger with count=0
    // after a DECR — we keep them so future inserts preserve canonical display).
    sql`${studioOrgSkill.candidateCount} > 0`,
  ];
  if (prefix) {
    // 归一列是 lowercase，普通 LIKE 即可，未来可考虑给 (org_id, normalized text_pattern_ops) 加索引。
    // The normalized column is lowercase, so a plain LIKE handles prefix matches.
    conditions.push(sql`${studioOrgSkill.normalized} LIKE ${`${prefix}%`}`);
  }

  const rows = await db
    .select({
      count: studioOrgSkill.candidateCount,
      skill: studioOrgSkill.display,
    })
    .from(studioOrgSkill)
    .where(and(...conditions))
    .orderBy(desc(studioOrgSkill.candidateCount), asc(studioOrgSkill.normalized))
    .limit(limit);

  return rows.map((row) => ({ count: row.count, skill: row.skill }));
}
