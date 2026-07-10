import { eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  interviewQuestionTemplate,
  interviewQuestionTemplateBinding,
  interviewQuestionTemplateQuestion,
  interviewQuestionTemplateVersion,
  organization,
  studioInterview,
} from "@arc/db-schema/schema";
import { ensureApplicableBindings, loadInterviewQuestionTemplateBindings } from "../bindings";

const ORG_A = "test_questions_scope_org_a";
const ORG_B = "test_questions_scope_org_b";
const INTERVIEW_ID = "test_questions_scope_interview";
const NOW = new Date("2026-05-26T10:00:00.000Z");
const TEMPLATE_IDS = ["test_questions_scope_a_global", "test_questions_scope_b_global"];

async function cleanup() {
  await db
    .delete(interviewQuestionTemplateBinding)
    .where(
      or(
        eq(interviewQuestionTemplateBinding.interviewRecordId, INTERVIEW_ID),
        inArray(interviewQuestionTemplateBinding.templateId, TEMPLATE_IDS),
      ),
    );
  await db
    .delete(interviewQuestionTemplateVersion)
    .where(inArray(interviewQuestionTemplateVersion.templateId, TEMPLATE_IDS));
  await db
    .delete(interviewQuestionTemplateQuestion)
    .where(inArray(interviewQuestionTemplateQuestion.templateId, TEMPLATE_IDS));
  await db
    .delete(interviewQuestionTemplate)
    .where(inArray(interviewQuestionTemplate.id, TEMPLATE_IDS));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_A));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_B));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(organization).values([
    { createdAt: NOW, id: ORG_A, name: "Questions Scope Org A", slug: ORG_A },
    { createdAt: NOW, id: ORG_B, name: "Questions Scope Org B", slug: ORG_B },
  ]);
  await db.insert(studioInterview).values({
    candidateEmail: "questions-scope@example.com",
    candidateName: "Questions Scope",
    candidatePhone: "",
    createdAt: NOW,
    id: INTERVIEW_ID,
    interviewQuestions: [],
    organizationId: ORG_A,
    targetRole: "",
    updatedAt: NOW,
  });
  await db.insert(interviewQuestionTemplate).values([
    {
      createdAt: NOW,
      id: "test_questions_scope_a_global",
      organizationId: ORG_A,
      scope: "global",
      title: "Org A 全局题",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      id: "test_questions_scope_b_global",
      organizationId: ORG_B,
      scope: "global",
      title: "Org B 全局题",
      updatedAt: NOW,
    },
  ]);
  await db.insert(interviewQuestionTemplateQuestion).values([
    {
      content: "Org A question",
      createdAt: NOW,
      difficulty: "easy",
      id: "test_questions_scope_a_q1",
      sortOrder: 0,
      templateId: "test_questions_scope_a_global",
      updatedAt: NOW,
    },
    {
      content: "Org B question",
      createdAt: NOW,
      difficulty: "easy",
      id: "test_questions_scope_b_q1",
      sortOrder: 0,
      templateId: "test_questions_scope_b_global",
      updatedAt: NOW,
    },
  ]);
}, 30_000);

afterAll(async () => {
  await cleanup();
}, 30_000);

describe("interview question applicable templates", () => {
  it("limits global templates and auto-bindings to the interview workspace", async () => {
    const beforeBinding = await loadInterviewQuestionTemplateBindings(INTERVIEW_ID);
    expect(beforeBinding.applicable.map((item) => item.id)).toEqual([
      "test_questions_scope_a_global",
    ]);

    await ensureApplicableBindings(INTERVIEW_ID);
    const afterBinding = await loadInterviewQuestionTemplateBindings(INTERVIEW_ID);

    expect(afterBinding.applicable.map((item) => item.id)).toEqual([
      "test_questions_scope_a_global",
    ]);
    expect(afterBinding.bindings.map((item) => item.templateId)).toEqual([
      "test_questions_scope_a_global",
    ]);
  }, 60_000);
});
