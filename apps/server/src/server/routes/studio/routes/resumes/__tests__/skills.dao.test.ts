// Real-DB integration tests for the skill sync + canonical/suggestion DAO.

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@app/server/lib/server/db";
import { member, organization, studioInterview, studioOrgSkill, user } from "@arc/db-schema/schema";
import {
  listOrgSkillSuggestions,
  syncResumeSkills,
} from "@app/server/server/routes/studio/routes/resumes/dao/skills";

const ORG_A = "test_org_skills_dao_a";
const ORG_B = "test_org_skills_dao_b";
const USER_ID = "test_user_skills_dao";
const INTERVIEW_A1 = "ri_test_skills_a1";
const INTERVIEW_A2 = "ri_test_skills_a2";
const INTERVIEW_B1 = "ri_test_skills_b1";

const NOW = new Date("2026-05-19T10:00:00.000Z");

async function cleanup() {
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_A));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_B));
  await db.delete(studioOrgSkill).where(eq(studioOrgSkill.organizationId, ORG_A));
  await db.delete(studioOrgSkill).where(eq(studioOrgSkill.organizationId, ORG_B));
  await db.delete(member).where(eq(member.userId, USER_ID));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
  await db.delete(user).where(eq(user.id, USER_ID));
}

async function loadNormalizedSkills(interviewId: string): Promise<string[]> {
  const [row] = await db
    .select({ skills: studioInterview.skillsNormalized })
    .from(studioInterview)
    .where(eq(studioInterview.id, interviewId));
  return [...(row?.skills ?? [])].toSorted();
}

async function loadOrgSkill(
  organizationId: string,
  normalized: string,
): Promise<{ display: string; count: number } | null> {
  const [row] = await db
    .select({
      count: studioOrgSkill.candidateCount,
      display: studioOrgSkill.display,
    })
    .from(studioOrgSkill)
    .where(
      and(
        eq(studioOrgSkill.organizationId, organizationId),
        eq(studioOrgSkill.normalized, normalized),
      ),
    );
  return row ?? null;
}

beforeAll(async () => {
  await cleanup();

  await db.insert(user).values({
    createdAt: NOW,
    email: "skills-dao@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "skills-dao",
    updatedAt: NOW,
  });

  await db.insert(organization).values([
    { createdAt: NOW, id: ORG_A, name: "Org A", slug: "test-skills-dao-a" },
    { createdAt: NOW, id: ORG_B, name: "Org B", slug: "test-skills-dao-b" },
  ]);

  await db.insert(member).values([
    {
      createdAt: NOW,
      id: "m_skills_dao_a",
      organizationId: ORG_A,
      role: "owner",
      userId: USER_ID,
    },
    {
      createdAt: NOW,
      id: "m_skills_dao_b",
      organizationId: ORG_B,
      role: "owner",
      userId: USER_ID,
    },
  ]);

  await db.insert(studioInterview).values([
    {
      candidateName: "A1",
      createdAt: NOW,
      id: INTERVIEW_A1,
      interviewQuestions: [],
      organizationId: ORG_A,
      updatedAt: NOW,
    },
    {
      candidateName: "A2",
      createdAt: NOW,
      id: INTERVIEW_A2,
      interviewQuestions: [],
      organizationId: ORG_A,
      updatedAt: NOW,
    },
    {
      candidateName: "B1",
      createdAt: NOW,
      id: INTERVIEW_B1,
      interviewQuestions: [],
      organizationId: ORG_B,
      updatedAt: NOW,
    },
  ]);
});

beforeEach(async () => {
  // 每个 it 之间清空两侧派生状态：candidate 行的数组列 + canonical 表。
  // Wipe both derived sides between tests: candidate's array column and the
  // canonical table.
  for (const id of [INTERVIEW_A1, INTERVIEW_A2, INTERVIEW_B1]) {
    await db
      .update(studioInterview)
      .set({ skillsNormalized: [] })
      .where(eq(studioInterview.id, id));
  }
  await db.delete(studioOrgSkill).where(eq(studioOrgSkill.organizationId, ORG_A));
  await db.delete(studioOrgSkill).where(eq(studioOrgSkill.organizationId, ORG_B));
});

afterAll(async () => {
  await cleanup();
});

describe("syncResumeSkills", () => {
  it("writes the normalized array on the candidate row + UPSERTs canonical counts", async () => {
    await db.transaction((tx) =>
      syncResumeSkills(tx, {
        interviewId: INTERVIEW_A1,
        organizationId: ORG_A,
        skills: ["React", "TypeScript"],
      }),
    );

    expect(await loadNormalizedSkills(INTERVIEW_A1)).toEqual(["react", "typescript"]);
    expect(await loadOrgSkill(ORG_A, "react")).toEqual({ count: 1, display: "React" });
    expect(await loadOrgSkill(ORG_A, "typescript")).toEqual({
      count: 1,
      display: "TypeScript",
    });
  });

  it("INCRs canonical count when another candidate gains the same skill", async () => {
    await db.transaction((tx) =>
      syncResumeSkills(tx, {
        interviewId: INTERVIEW_A1,
        organizationId: ORG_A,
        skills: ["React"],
      }),
    );
    await db.transaction((tx) =>
      syncResumeSkills(tx, {
        interviewId: INTERVIEW_A2,
        organizationId: ORG_A,
        skills: ["React", "Vue"],
      }),
    );

    expect(await loadOrgSkill(ORG_A, "react")).toEqual({ count: 2, display: "React" });
    expect(await loadOrgSkill(ORG_A, "vue")).toEqual({ count: 1, display: "Vue" });
  });

  it("DECRs canonical count when a candidate loses a skill (delta sync)", async () => {
    await db.transaction((tx) =>
      syncResumeSkills(tx, {
        interviewId: INTERVIEW_A1,
        organizationId: ORG_A,
        skills: ["React", "TypeScript"],
      }),
    );
    // 第二次只剩 React，TypeScript 应该 -1
    await db.transaction((tx) =>
      syncResumeSkills(tx, {
        interviewId: INTERVIEW_A1,
        organizationId: ORG_A,
        skills: ["React"],
      }),
    );

    expect(await loadOrgSkill(ORG_A, "react")).toEqual({ count: 1, display: "React" });
    expect(await loadOrgSkill(ORG_A, "typescript")).toEqual({ count: 0, display: "TypeScript" });
  });

  it("clears the array when given empty/null + DECRs all counters", async () => {
    await db.transaction((tx) =>
      syncResumeSkills(tx, {
        interviewId: INTERVIEW_A1,
        organizationId: ORG_A,
        skills: ["React", "Vue"],
      }),
    );
    await db.transaction((tx) =>
      syncResumeSkills(tx, {
        interviewId: INTERVIEW_A1,
        organizationId: ORG_A,
        skills: null,
      }),
    );

    expect(await loadNormalizedSkills(INTERVIEW_A1)).toEqual([]);
    const react = await loadOrgSkill(ORG_A, "react");
    const vue = await loadOrgSkill(ORG_A, "vue");
    expect(react?.count).toBe(0);
    expect(vue?.count).toBe(0);
  });

  it("preserves the first display value when later writes use different casing", async () => {
    await db.transaction((tx) =>
      syncResumeSkills(tx, {
        interviewId: INTERVIEW_A1,
        organizationId: ORG_A,
        skills: ["React"],
      }),
    );
    // 第二个候选人写 "react"（小写），display 应保留首次的 "React"
    // Second candidate writes "react" (lowercase); display should stay "React".
    await db.transaction((tx) =>
      syncResumeSkills(tx, {
        interviewId: INTERVIEW_A2,
        organizationId: ORG_A,
        skills: ["react"],
      }),
    );

    expect(await loadOrgSkill(ORG_A, "react")).toEqual({ count: 2, display: "React" });
  });

  it("collapses case-only variants within one candidate into a single row", async () => {
    await db.transaction((tx) =>
      syncResumeSkills(tx, {
        interviewId: INTERVIEW_A1,
        organizationId: ORG_A,
        skills: ["React", "react", "REACT"],
      }),
    );

    expect(await loadNormalizedSkills(INTERVIEW_A1)).toEqual(["react"]);
    expect(await loadOrgSkill(ORG_A, "react")).toEqual({ count: 1, display: "React" });
  });

  it("collapses multi-space variants — 'Claude  Code' and 'Claude Code' merge", async () => {
    await db.transaction((tx) =>
      syncResumeSkills(tx, {
        interviewId: INTERVIEW_A1,
        organizationId: ORG_A,
        skills: ["Claude  Code", "claude code"],
      }),
    );

    expect(await loadNormalizedSkills(INTERVIEW_A1)).toEqual(["claude code"]);
    expect(await loadOrgSkill(ORG_A, "claude code")).toEqual({
      count: 1,
      display: "Claude Code",
    });
  });

  it("keeps every distinct skill for one candidate", async () => {
    const many = Array.from({ length: 30 }, (_, i) => `skill-${i.toString().padStart(2, "0")}`);
    await db.transaction((tx) =>
      syncResumeSkills(tx, {
        interviewId: INTERVIEW_A1,
        organizationId: ORG_A,
        skills: many,
      }),
    );

    const stored = await loadNormalizedSkills(INTERVIEW_A1);
    expect(stored).toHaveLength(30);
    expect(stored).toContain("skill-00");
    expect(stored).toContain("skill-18");
    expect(stored).toContain("skill-29");
  });
});

describe("listOrgSkillSuggestions", () => {
  beforeEach(async () => {
    // 3 candidates with overlapping skills, plus one in a sibling org.
    await db.transaction(async (tx) => {
      await syncResumeSkills(tx, {
        interviewId: INTERVIEW_A1,
        organizationId: ORG_A,
        skills: ["React", "TypeScript", "Node.js"],
      });
      await syncResumeSkills(tx, {
        interviewId: INTERVIEW_A2,
        organizationId: ORG_A,
        skills: ["React", "Redis"],
      });
      await syncResumeSkills(tx, {
        interviewId: INTERVIEW_B1,
        organizationId: ORG_B,
        skills: ["React", "Vue", "Vue Router"],
      });
    });
  });

  it("orders skills by candidate count desc, tie-broken by normalized asc", async () => {
    const rows = await listOrgSkillSuggestions(ORG_A);
    const [top] = rows;
    expect(top?.skill).toBe("React");
    expect(top?.count).toBe(2);

    const remaining = rows.slice(1);
    expect(remaining.map((r) => r.skill)).toEqual(["Node.js", "Redis", "TypeScript"]);
    for (const row of remaining) {
      expect(row.count).toBe(1);
    }
  });

  it("does not leak skills from sibling organizations", async () => {
    const rows = await listOrgSkillSuggestions(ORG_A);
    const skills = rows.map((r) => r.skill);
    expect(skills).not.toContain("Vue");
    expect(skills).not.toContain("Vue Router");
  });

  it("supports prefix filtering (case-insensitive)", async () => {
    const rows = await listOrgSkillSuggestions(ORG_A, { prefix: "Re" });
    expect(rows.map((r) => r.skill).toSorted()).toEqual(["React", "Redis"]);
  });

  it("clamps limit between 1 and 100", async () => {
    const oneOnly = await listOrgSkillSuggestions(ORG_A, { limit: 1 });
    expect(oneOnly).toHaveLength(1);
    expect(oneOnly[0]?.skill).toBe("React");
  });

  it("hides skills whose candidate_count has fallen to 0", async () => {
    // Drain ORG_A.react down to zero by clearing both candidates' skills.
    await db.transaction(async (tx) => {
      await syncResumeSkills(tx, {
        interviewId: INTERVIEW_A1,
        organizationId: ORG_A,
        skills: [],
      });
      await syncResumeSkills(tx, {
        interviewId: INTERVIEW_A2,
        organizationId: ORG_A,
        skills: [],
      });
    });

    const rows = await listOrgSkillSuggestions(ORG_A);
    expect(rows.map((r) => r.skill)).not.toContain("React");
  });
});

describe("DELETE trigger keeps canonical counts in sync", () => {
  it("decrements all relevant counters when a candidate row is deleted directly", async () => {
    const cascadeId = "ri_test_skills_trigger";
    await db.insert(studioInterview).values({
      candidateName: "trigger",
      createdAt: NOW,
      id: cascadeId,
      interviewQuestions: [],
      organizationId: ORG_A,
      updatedAt: NOW,
    });
    await db.transaction((tx) =>
      syncResumeSkills(tx, {
        interviewId: cascadeId,
        organizationId: ORG_A,
        skills: ["Cascade-A", "Cascade-B"],
      }),
    );
    const beforeA = await loadOrgSkill(ORG_A, "cascade-a");
    const beforeB = await loadOrgSkill(ORG_A, "cascade-b");
    expect(beforeA?.count).toBe(1);
    expect(beforeB?.count).toBe(1);

    await db.delete(studioInterview).where(eq(studioInterview.id, cascadeId));

    const afterA = await loadOrgSkill(ORG_A, "cascade-a");
    const afterB = await loadOrgSkill(ORG_A, "cascade-b");
    expect(afterA?.count).toBe(0);
    expect(afterB?.count).toBe(0);
  });
});
