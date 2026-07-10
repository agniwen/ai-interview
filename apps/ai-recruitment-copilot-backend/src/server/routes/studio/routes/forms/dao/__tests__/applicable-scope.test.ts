import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { candidateFormTemplate, organization, studioInterview } from "@arc/db-schema/schema";
import { loadApplicableCandidateFormTemplates } from "../queries";

const ORG_A = "test_forms_scope_org_a";
const ORG_B = "test_forms_scope_org_b";
const INTERVIEW_ID = "test_forms_scope_interview";
const NOW = new Date("2026-05-26T10:00:00.000Z");

async function cleanup() {
  await db.delete(candidateFormTemplate).where(eq(candidateFormTemplate.organizationId, ORG_A));
  await db.delete(candidateFormTemplate).where(eq(candidateFormTemplate.organizationId, ORG_B));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_A));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_B));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(organization).values([
    { createdAt: NOW, id: ORG_A, name: "Forms Scope Org A", slug: ORG_A },
    { createdAt: NOW, id: ORG_B, name: "Forms Scope Org B", slug: ORG_B },
  ]);
  await db.insert(studioInterview).values({
    candidateEmail: "forms-scope@example.com",
    candidateName: "Forms Scope",
    candidatePhone: "",
    createdAt: NOW,
    id: INTERVIEW_ID,
    interviewQuestions: [],
    organizationId: ORG_A,
    targetRole: "",
    updatedAt: NOW,
  });
  await db.insert(candidateFormTemplate).values([
    {
      createdAt: NOW,
      id: "test_forms_scope_a_global",
      organizationId: ORG_A,
      scope: "global",
      title: "Org A 全局表单",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      id: "test_forms_scope_b_global",
      organizationId: ORG_B,
      scope: "global",
      title: "Org B 全局表单",
      updatedAt: NOW,
    },
  ]);
});

afterAll(async () => {
  await cleanup();
});

describe("loadApplicableCandidateFormTemplates", () => {
  it("limits global templates to the interview workspace", async () => {
    const result = await loadApplicableCandidateFormTemplates(INTERVIEW_ID);

    expect(result.global.map((item) => item.id)).toEqual(["test_forms_scope_a_global"]);
    expect(result.jobSpecific).toEqual([]);
  });
});
