import { candidateFormsRouter } from "../../../../../interview/forms-route";
import assert from "node:assert/strict";
import { prepareQuestionBindings } from "../../../../../interview/application/prepare-question-bindings";
import { deleteRecruitingRecords, createRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../../../lib/server/db/index";
import { jsonValueSchema } from "../../../../../../../lib/server/stable-stringify";
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
  recruitingRecord,
  recruitingNodeState,
  recruitingFormSubmission,
} from "@app/db-schema/schema";
import {
  buildInterviewContextSnapshotPayload,
  createInterviewContextSnapshot,
  hashSnapshotPayload,
  loadActiveInterviewContextSnapshot,
  refreshInterviewContextSnapshot,
  releaseInterviewContextBinding,
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
    expect(() => hashSnapshotPayload(jsonValueSchema.parse(payload))).not.toThrow();
    expect(payload.jobDescription).toStrictEqual({
      id: "jd-1",
      name: "Backend Engineer",
      prompt: "JD prompt",
    });
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
    .delete(recruitingFormSubmission)
    .where(eq(recruitingFormSubmission.recruitingRecordId, INTERVIEW_ID));
  await db
    .update(recruitingNodeState)
    .set({ effectiveAiRoundId: null })
    .where(eq(recruitingNodeState.recruitingRecordId, INTERVIEW_ID));
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
    evaluationMode: "qualitative",
    id: JD_ID,
    internalCriteria: null,
    lifecycleStatus: "published",
    name: "Snapshot Backend",
    organizationId: ORG_ID,
    prompt: "Snapshot JD prompt",
    publishedAt: NOW,
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
    expect(snapshot.payload.jobDescription).toStrictEqual({
      id: JD_ID,
      name: "Snapshot Backend",
      prompt: "Snapshot JD prompt",
    });

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

describe("candidate action binding boundaries", () => {
  const options = {
    createdBy: null,
    interviewRecordId: INTERVIEW_ID,
    reason: "manual_refresh" as const,
    scheduleEntryId: ROUND_ID,
  };
  const prepare = (phase: "forms" | "questions", preview = false) =>
    db.transaction((tx) =>
      prepareQuestionBindings(tx, {
        interviewRecordId: INTERVIEW_ID,
        phase,
        preview,
        roundId: ROUND_ID,
      }),
    );

  it("previews without freezing, binds once per action, and preserves forms on question reset", async () => {
    await db
      .update(recruitingRecord)
      .set({ currentStage: "ai_interview" })
      .where(eq(recruitingRecord.id, INTERVIEW_ID));
    await db
      .update(recruitingNodeState)
      .set({ effectiveAiRoundId: ROUND_ID, status: "pending" })
      .where(
        and(
          eq(recruitingNodeState.recruitingRecordId, INTERVIEW_ID),
          eq(recruitingNodeState.node, "ai_interview"),
        ),
      );
    const draft = await db.transaction((tx) =>
      refreshInterviewContextSnapshot(tx, { ...options, bindingPhase: "draft" }),
    );
    expect(draft.payload.bindings).toEqual({ forms: false, questions: false });
    expect(draft.payload.forms).toEqual([]);
    expect(draft.payload.questionTemplates).toEqual([]);
    const preview = await prepare("forms", true);
    expect(preview?.forms).toHaveLength(1);
    const afterPreview = await loadActiveInterviewContextSnapshot(INTERVIEW_ID);
    expect(afterPreview?.id).toBe(draft.id);
    expect(await prepare("questions")).toBeNull();
    await db
      .update(candidateFormTemplateQuestion)
      .set({ label: "Form at first open" })
      .where(eq(candidateFormTemplateQuestion.templateId, FORM_TEMPLATE_ID));
    const [forms, concurrentForms] = await Promise.all([prepare("forms"), prepare("forms")]);
    assert.ok(forms);
    expect(concurrentForms).toEqual(forms);
    expect(forms.forms[0]?.snapshot.questions[0]?.label).toBe("Form at first open");
    expect(forms.bindings).toEqual({ forms: true, questions: false });
    expect(await prepare("questions")).toBeNull();
    const afterBlockedStart = await loadActiveInterviewContextSnapshot(INTERVIEW_ID);
    expect(afterBlockedStart?.payload.bindings?.questions).toBe(false);
    await db
      .update(candidateFormTemplateQuestion)
      .set({ label: "Later form edit" })
      .where(eq(candidateFormTemplateQuestion.templateId, FORM_TEMPLATE_ID));
    expect(await prepare("forms")).toEqual(forms);
    const [form] = forms.forms;
    assert.ok(form);
    await db.insert(recruitingFormSubmission).values({
      answers: { test_context_snapshot_form_q1: "answer" },
      id: "test_binding_submission",
      organizationId: ORG_ID,
      recruitingRecordId: INTERVIEW_ID,
      templateId: form.templateId,
      versionId: form.versionId,
    });
    await db
      .update(interviewQuestionTemplateQuestion)
      .set({ content: "Question at start" })
      .where(eq(interviewQuestionTemplateQuestion.templateId, QUESTION_TEMPLATE_ID));
    const started = await prepare("questions");
    expect(started?.forms).toEqual(forms.forms);
    expect(started?.questionTemplates[0]?.snapshot.questions[0]?.content).toBe("Question at start");
    await db
      .update(interviewQuestionTemplateQuestion)
      .set({ content: "Later question edit" })
      .where(eq(interviewQuestionTemplateQuestion.templateId, QUESTION_TEMPLATE_ID));
    expect(await prepare("questions")).toEqual(started);
    const resetQuestions = await db.transaction((tx) =>
      releaseInterviewContextBinding(tx, { ...options, phase: "questions" }),
    );
    expect(resetQuestions.payload.forms).toEqual(forms.forms);
    expect(resetQuestions.payload.bindings).toEqual({ forms: true, questions: false });
    const restarted = await prepare("questions");
    expect(restarted?.questionTemplates[0]?.snapshot.questions[0]?.content).toBe(
      "Later question edit",
    );
    await db
      .delete(recruitingFormSubmission)
      .where(eq(recruitingFormSubmission.recruitingRecordId, INTERVIEW_ID));
    await db.transaction((tx) =>
      releaseInterviewContextBinding(tx, { ...options, phase: "forms" }),
    );
    expect(await prepare("questions")).toBeNull();
    const reopened = await prepare("forms");
    expect(reopened?.forms[0]?.snapshot.questions[0]?.label).toBe("Later form edit");
    expect(reopened?.bindings).toEqual({ forms: true, questions: true });
  });

  it("rebinds unopened legacy invitations but preserves already-started legacy sessions", async () => {
    const legacy = await db.transaction((tx) => refreshInterviewContextSnapshot(tx, options));
    const { bindings: _bindings, ...payload } = legacy.payload;
    await db.transaction((tx) =>
      refreshInterviewContextSnapshot(tx, { ...options, payloadOverride: payload }),
    );
    await db
      .update(candidateFormTemplateQuestion)
      .set({ label: "Latest legacy form" })
      .where(eq(candidateFormTemplateQuestion.templateId, FORM_TEMPLATE_ID));
    const legacyForms = await prepare("forms");
    expect(legacyForms?.forms[0]?.snapshot.questions[0]?.label).toBe("Latest legacy form");
    await db.transaction((tx) =>
      refreshInterviewContextSnapshot(tx, { ...options, payloadOverride: payload }),
    );
    await db
      .update(aiInterviewRound)
      .set({ sessionStartedAt: new Date(), status: "in_progress" })
      .where(eq(aiInterviewRound.id, ROUND_ID));
    expect(await prepare("forms")).toEqual(payload);
    await db
      .update(aiInterviewRound)
      .set({ sessionStartedAt: null, status: "pending" })
      .where(eq(aiInterviewRound.id, ROUND_ID));
  });
  it("binds through the forms endpoint and rejects stale submissions after a reset", async () => {
    const draft = await db.transaction((tx) =>
      refreshInterviewContextSnapshot(tx, { ...options, bindingPhase: "draft" }),
    );
    const path = `/${INTERVIEW_ID}/${ROUND_ID}/forms`;
    const preview = await candidateFormsRouter.request(path);
    expect(preview.status).toBe(200);
    const afterPreview = await loadActiveInterviewContextSnapshot(INTERVIEW_ID);
    expect(afterPreview?.id).toBe(draft.id);
    const opened = await candidateFormsRouter.request(`${path}/bind`, { method: "POST" });
    expect(opened.status).toBe(200);
    const bound = await loadActiveInterviewContextSnapshot(INTERVIEW_ID);
    const form = bound?.payload.forms[0];
    assert.ok(form);
    await db.transaction((tx) =>
      releaseInterviewContextBinding(tx, { ...options, phase: "forms" }),
    );
    const submit = () =>
      candidateFormsRouter.request(`${path}/${form.templateId}/submit`, {
        body: JSON.stringify({
          answers: { test_context_snapshot_form_q1: "answer" },
          versionId: form.versionId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
    const stale = await submit();
    expect(stale.status).toBe(409);
    await candidateFormsRouter.request(`${path}/bind`, { method: "POST" });
    const accepted = await submit();
    expect(accepted.status).toBe(200);
    await db
      .delete(recruitingFormSubmission)
      .where(eq(recruitingFormSubmission.recruitingRecordId, INTERVIEW_ID));
  });

  it("allows empty forms and retries latest communication questions after an empty configuration", async () => {
    const current = await loadActiveInterviewContextSnapshot(INTERVIEW_ID);
    assert.ok(current);
    await db.transaction((tx) =>
      refreshInterviewContextSnapshot(tx, {
        ...options,
        payloadOverride: {
          ...current.payload,
          bindings: { forms: true, questions: false },
          forms: [],
          questionTemplates: [],
        },
      }),
    );
    await db
      .update(interviewQuestionTemplateQuestion)
      .set({ content: "" })
      .where(eq(interviewQuestionTemplateQuestion.templateId, QUESTION_TEMPLATE_ID));
    const empty = await prepare("questions");
    expect(empty?.questionTemplates[0]?.snapshot.questions[0]?.content).toBe("");
    const afterEmpty = await loadActiveInterviewContextSnapshot(INTERVIEW_ID);
    expect(afterEmpty?.payload.bindings?.questions).toBe(false);
    await db
      .update(interviewQuestionTemplateQuestion)
      .set({ content: "Configured after failed start" })
      .where(eq(interviewQuestionTemplateQuestion.templateId, QUESTION_TEMPLATE_ID));
    const retried = await prepare("questions");
    expect(retried?.questionTemplates[0]?.snapshot.questions[0]?.content).toBe(
      "Configured after failed start",
    );
    expect(retried?.forms).toEqual([]);
    await db
      .update(aiInterviewRound)
      .set({ sessionStartedAt: new Date(), status: "in_progress" })
      .where(eq(aiInterviewRound.id, ROUND_ID));
    await db
      .update(interviewQuestionTemplateQuestion)
      .set({ content: "Edited during session" })
      .where(eq(interviewQuestionTemplateQuestion.templateId, QUESTION_TEMPLATE_ID));
    expect(await prepare("questions")).toEqual(retried);
  });
});
