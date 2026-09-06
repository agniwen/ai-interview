import { deleteRecruitingRecords, createRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { eq, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../../../lib/server/db/index";
import type { CandidateFormTemplateSnapshot } from "@app/db-schema/candidate-forms";
import type { InterviewQuestionTemplateSnapshot } from "@app/db-schema/interview-question-templates";
import {
  candidateFormTemplate,
  candidateFormTemplateQuestion,
  candidateFormTemplateVersion,
  department,
  globalConfig,
  recruitingContextSnapshot,
  interviewQuestionTemplate,
  recruitingQuestionTemplateBinding,
  interviewQuestionTemplateQuestion,
  interviewQuestionTemplateVersion,
  jobDescription,
  organization,
  aiInterviewRound,
} from "@app/db-schema/schema";
import {
  buildInterviewContextSnapshotPayload,
  createInterviewContextSnapshot,
  hashSnapshotPayload,
  loadActiveInterviewContextSnapshot,
  refreshInterviewContextSnapshot,
} from "../context-snapshots";

const formSnapshot: CandidateFormTemplateSnapshot = {
  description: "Collect basic candidate expectations",
  jobDescriptionIds: ["jd-1"],
  questions: [
    {
      displayMode: "textarea",
      helperText: null,
      id: "form-q-1",
      label: "Expected salary",
      options: [],
      required: true,
      sortOrder: 0,
      type: "text",
    },
  ],
  scope: "job_description",
  templateId: "form-template-1",
  title: "Candidate Form v1",
};

const questionSnapshot: InterviewQuestionTemplateSnapshot = {
  description: null,
  jobDescriptionIds: ["jd-1"],
  questions: [
    {
      content: "Explain a production incident you handled.",
      difficulty: "medium",
      id: "question-template-q-1",
      sortOrder: 0,
    },
  ],
  scope: "job_description",
  templateId: "question-template-1",
  title: "Backend Questions v3",
};

describe("interview context snapshot payload", () => {
  it("freezes form and question template version snapshots", () => {
    const payload = buildInterviewContextSnapshotPayload({
      candidate: {
        candidateEmail: "candidate@example.com",
        candidateName: "Candidate A",
        candidatePhone: "13800000000",
        resumeProfile: null,
        targetRole: "Backend Engineer",
      },
      createdAt: "2026-06-26T10:00:00.000Z",
      forms: [
        {
          snapshot: formSnapshot,
          templateId: "form-template-1",
          version: 1,
          versionId: "form-version-1",
        },
      ],
      globalConfig: {
        closingInstructions: "Close politely",
        companyContext: "Company context",
        openingInstructions: "Open politely",
      },
      interviewRecordId: "interview-1",
      interviewers: [{ name: "Interviewer A", prompt: "Be direct", voice: null }],
      jobDescription: {
        id: "jd-1",
        name: "Backend Engineer",
        prompt: "JD prompt",
      },
      personalizedQuestions: [
        { difficulty: "easy", order: 1, question: "Tell me about your recent project." },
      ],
      questionTemplates: [
        {
          bindingId: "binding-1",
          disabledByUser: false,
          scope: "job_description",
          snapshot: questionSnapshot,
          sortOrder: 0,
          templateId: "question-template-1",
          version: 3,
          versionId: "question-version-3",
        },
      ],
      scheduleEntryId: "round-1",
    });

    expect(payload.schemaVersion).toBe(1);
    expect(payload.forms[0]?.versionId).toBe("form-version-1");
    expect(payload.forms[0]?.snapshot.title).toBe("Candidate Form v1");
    expect(payload.questionTemplates[0]?.versionId).toBe("question-version-3");
    expect(payload.questionTemplates[0]?.snapshot.title).toBe("Backend Questions v3");
    expect(payload.personalizedQuestions[0]?.question).toBe("Tell me about your recent project.");
  });

  it("hashes semantically equal payloads the same regardless of object key order", () => {
    const left = { a: 1, nested: { b: 2, c: 3 } };
    const right = { a: 1, nested: { b: 2, c: 3 } };

    expect(hashSnapshotPayload(left)).toBe(hashSnapshotPayload(right));
  });
});

const ORG_ID = "test_context_snapshot_org";
const INTERVIEW_ID = "test_context_snapshot_interview";
const ROUND_ID = "test_context_snapshot_round";
const JD_ID = "test_context_snapshot_jd";
const DEPARTMENT_ID = "test_context_snapshot_department";
const FORM_TEMPLATE_ID = "test_context_snapshot_form";
const QUESTION_TEMPLATE_ID = "test_context_snapshot_question_template";
const NOW = new Date("2026-06-26T10:00:00.000Z");

async function cleanup() {
  await db
    .delete(recruitingContextSnapshot)
    .where(eq(recruitingContextSnapshot.recruitingRecordId, INTERVIEW_ID));
  await db
    .delete(recruitingQuestionTemplateBinding)
    .where(
      or(
        eq(recruitingQuestionTemplateBinding.recruitingRecordId, INTERVIEW_ID),
        eq(recruitingQuestionTemplateBinding.templateId, QUESTION_TEMPLATE_ID),
      ),
    );
  await db
    .delete(interviewQuestionTemplateVersion)
    .where(eq(interviewQuestionTemplateVersion.templateId, QUESTION_TEMPLATE_ID));
  await db
    .delete(interviewQuestionTemplateQuestion)
    .where(eq(interviewQuestionTemplateQuestion.templateId, QUESTION_TEMPLATE_ID));
  await db
    .delete(interviewQuestionTemplate)
    .where(eq(interviewQuestionTemplate.id, QUESTION_TEMPLATE_ID));
  await db
    .delete(candidateFormTemplateVersion)
    .where(eq(candidateFormTemplateVersion.templateId, FORM_TEMPLATE_ID));
  await db
    .delete(candidateFormTemplateQuestion)
    .where(eq(candidateFormTemplateQuestion.templateId, FORM_TEMPLATE_ID));
  await db.delete(candidateFormTemplate).where(eq(candidateFormTemplate.id, FORM_TEMPLATE_ID));
  await db.delete(aiInterviewRound).where(eq(aiInterviewRound.id, ROUND_ID));
  await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.id, INTERVIEW_ID));
  await db.delete(globalConfig).where(eq(globalConfig.organizationId, ORG_ID));
  await db.delete(jobDescription).where(eq(jobDescription.id, JD_ID));
  await db.delete(department).where(eq(department.id, DEPARTMENT_ID));
  await db.delete(organization).where(eq(organization.id, ORG_ID));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG_ID,
    name: "Context Snapshot Org",
    slug: ORG_ID,
  });
  await db.insert(globalConfig).values({
    closingInstructions: "Closing snapshot",
    companyContext: "Company snapshot",
    companyName: "Snapshot Co",
    id: "test_context_snapshot_global_config",
    jobCodePrefix: "SNP",
    openingInstructions: "Opening snapshot",
    organizationId: ORG_ID,
    updatedAt: NOW,
    updatedBy: null,
  });
  await db.insert(department).values({
    createdAt: NOW,
    id: DEPARTMENT_ID,
    name: "Snapshot Department",
    organizationId: ORG_ID,
    updatedAt: NOW,
  });
  await db.insert(jobDescription).values({
    createdAt: NOW,
    departmentId: DEPARTMENT_ID,
    id: JD_ID,
    name: "Snapshot Backend",
    organizationId: ORG_ID,
    prompt: "Snapshot JD prompt",
    updatedAt: NOW,
  });
  await createRecruitingRecords(db, {
    candidateEmail: "snapshot@example.com",
    candidateName: "Snapshot Candidate",
    candidatePhone: "13800000000",
    createdAt: NOW,
    id: INTERVIEW_ID,
    interviewQuestions: [
      {
        difficulty: "easy",
        order: 1,
        question: "What did you build recently?",
      },
    ],
    jobDescriptionId: JD_ID,
    organizationId: ORG_ID,
    resumeProfile: null,
    targetRole: "Backend Engineer",
    updatedAt: NOW,
  });
  await db.insert(aiInterviewRound).values({
    createdAt: NOW,
    id: ROUND_ID,
    organizationId: ORG_ID,
    recruitingRecordId: INTERVIEW_ID,
    roundLabel: "AI 面试",
    scheduledAt: null,
    sortOrder: 0,
    status: "pending",
    updatedAt: NOW,
  });
  await db.insert(candidateFormTemplate).values({
    createdAt: NOW,
    id: FORM_TEMPLATE_ID,
    organizationId: ORG_ID,
    scope: "global",
    title: "Snapshot Form",
    updatedAt: NOW,
  });
  await db.insert(candidateFormTemplateQuestion).values({
    createdAt: NOW,
    displayMode: "textarea",
    id: "test_context_snapshot_form_q1",
    label: "Expected salary",
    options: [],
    required: true,
    sortOrder: 0,
    templateId: FORM_TEMPLATE_ID,
    type: "text",
    updatedAt: NOW,
  });
  await db.insert(interviewQuestionTemplate).values({
    createdAt: NOW,
    id: QUESTION_TEMPLATE_ID,
    organizationId: ORG_ID,
    scope: "global",
    title: "Snapshot Questions",
    updatedAt: NOW,
  });
  await db.insert(interviewQuestionTemplateQuestion).values({
    content: "Describe your debugging workflow.",
    createdAt: NOW,
    difficulty: "medium",
    id: "test_context_snapshot_question_q1",
    sortOrder: 0,
    templateId: QUESTION_TEMPLATE_ID,
    updatedAt: NOW,
  });
}, 30_000);

afterAll(async () => {
  await cleanup();
}, 30_000);

describe("interview context snapshot DAO", () => {
  it("creates and loads an active snapshot for an interview", async () => {
    const snapshot = await db.transaction((tx) =>
      createInterviewContextSnapshot(tx, {
        createdAt: NOW,
        createdBy: null,
        interviewRecordId: INTERVIEW_ID,
        reason: "create",
        scheduleEntryId: ROUND_ID,
      }),
    );

    expect(snapshot.status).toBe("active");
    expect(snapshot.version).toBe(1);
    expect(snapshot.payload.forms.map((form) => form.templateId)).toEqual([FORM_TEMPLATE_ID]);
    expect(snapshot.payload.questionTemplates.map((template) => template.templateId)).toEqual([
      QUESTION_TEMPLATE_ID,
    ]);
    expect(snapshot.payload.globalConfig.companyContext).toBe("Company snapshot");

    const active = await loadActiveInterviewContextSnapshot(INTERVIEW_ID);
    expect(active?.id).toBe(snapshot.id);
  }, 60_000);

  it("refreshes by superseding the old active snapshot and creating a new version", async () => {
    await db
      .update(candidateFormTemplate)
      .set({ title: "Snapshot Form Refreshed" })
      .where(eq(candidateFormTemplate.id, FORM_TEMPLATE_ID));

    const refreshed = await db.transaction((tx) =>
      refreshInterviewContextSnapshot(tx, {
        createdAt: new Date("2026-06-26T11:00:00.000Z"),
        createdBy: null,
        interviewRecordId: INTERVIEW_ID,
        reason: "manual_refresh",
        scheduleEntryId: ROUND_ID,
      }),
    );

    expect(refreshed.status).toBe("active");
    expect(refreshed.version).toBe(2);
    expect(refreshed.payload.forms[0]?.snapshot.title).toBe("Snapshot Form Refreshed");

    const rows = await db
      .select({
        status: recruitingContextSnapshot.status,
        version: recruitingContextSnapshot.version,
      })
      .from(recruitingContextSnapshot)
      .where(eq(recruitingContextSnapshot.recruitingRecordId, INTERVIEW_ID));

    expect(rows.toSorted((a, b) => a.version - b.version)).toEqual([
      { status: "superseded", version: 1 },
      { status: "active", version: 2 },
    ]);
  }, 60_000);
});
