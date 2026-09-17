import {
  deleteRecruitingRecords,
  createRecruitingRecords,
  updateRecruitingRecords,
} from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
// Real-DB integration tests for the skill sync + canonical/suggestion DAO.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../../../../lib/server/db/index";
import { member, organization, studioOrgSkill, user } from "@app/db-schema/schema";
import { listOrgSkillSuggestions, syncResumeSkills } from "../dao/skills";

const ORG_A = "test_org_skills_dao_a";
const ORG_B = "test_org_skills_dao_b";
const USER_ID = "test_user_skills_dao";
const INTERVIEW_A1 = "ri_test_skills_a1";
const INTERVIEW_A2 = "ri_test_skills_a2";
const INTERVIEW_B1 = "ri_test_skills_b1";

const NOW = new Date("2026-05-19T10:00:00.000Z");

async function cleanup() {
  await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.organizationId, ORG_A));
  await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.organizationId, ORG_B));
  await db.delete(studioOrgSkill).where(eq(studioOrgSkill.organizationId, ORG_A));
  await db.delete(studioOrgSkill).where(eq(studioOrgSkill.organizationId, ORG_B));
  await db.delete(member).where(eq(member.userId, USER_ID));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
  await db.delete(user).where(eq(user.id, USER_ID));
}

async function loadNormalizedSkills(interviewId: string): Promise<string[]> {
  const [row] = await db
    .select({ skills: recruitingRecordReadModel.skillsNormalized })
    .from(recruitingRecordReadModel)
    .where(eq(recruitingRecordReadModel.id, interviewId));
  return [...(row?.skills ?? [])].toSorted();
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

  await createRecruitingRecords(db, [
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
    await updateRecruitingRecords(db, eq(recruitingRecordReadModel.id, id), {
      skillsNormalized: [],
    });
  }
  await db.delete(studioOrgSkill).where(eq(studioOrgSkill.organizationId, ORG_A));
  await db.delete(studioOrgSkill).where(eq(studioOrgSkill.organizationId, ORG_B));
});

afterAll(async () => {
  await cleanup();
});

async function sync(id: string, skills: string[] | null, organizationId = ORG_A) {
  await db.transaction((tx) => syncResumeSkills(tx, { interviewId: id, organizationId, skills }));
}

describe("new recruiting skill suggestions", () => {
  it("normalizes skills and counts each current recruiting record once", async () => {
    await sync(INTERVIEW_A1, [" React ", "REACT", "Claude  Code"]);
    await sync(INTERVIEW_A2, ["React", "Redis"]);
    expect(await loadNormalizedSkills(INTERVIEW_A1)).toEqual(["claude code", "react"]);
    expect(await listOrgSkillSuggestions(ORG_A)).toEqual([
      { count: 2, skill: "react" },
      { count: 1, skill: "claude code" },
      { count: 1, skill: "redis" },
    ]);
  });
  it("reflects removals and null resets without writing historical counters", async () => {
    await db
      .insert(studioOrgSkill)
      .values({ candidateCount: 99, display: "React", normalized: "react", organizationId: ORG_A });
    await sync(INTERVIEW_A1, ["React"]);
    expect(await listOrgSkillSuggestions(ORG_A)).toEqual([{ count: 1, skill: "React" }]);
    await sync(INTERVIEW_A1, null);
    expect(await listOrgSkillSuggestions(ORG_A)).toEqual([]);
    const [historical] = await db
      .select()
      .from(studioOrgSkill)
      .where(eq(studioOrgSkill.organizationId, ORG_A));
    expect(historical?.candidateCount).toBe(99);
  });
  it("scopes reads and writes by organization and supports case-insensitive prefix and limit", async () => {
    await sync(INTERVIEW_A1, ["React", "Redis"]);
    await sync(INTERVIEW_B1, ["Vue"], ORG_B);
    await sync(INTERVIEW_A1, ["Leaked"], ORG_B);
    expect(await listOrgSkillSuggestions(ORG_A, { limit: 1, prefix: "RE" })).toEqual([
      { count: 1, skill: "react" },
    ]);
    expect(await listOrgSkillSuggestions(ORG_B)).toEqual([{ count: 1, skill: "vue" }]);
  });
  it("immediately drops deleted records from counts without the old DELETE trigger", async () => {
    const id = "ri_test_skills_deleted";
    await createRecruitingRecords(db, {
      candidateName: "delete",
      id,
      organizationId: ORG_A,
      skillsNormalized: ["cascade"],
    });
    expect(await listOrgSkillSuggestions(ORG_A)).toEqual([{ count: 1, skill: "cascade" }]);
    await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.id, id));
    expect(await listOrgSkillSuggestions(ORG_A)).toEqual([]);
  });
});
