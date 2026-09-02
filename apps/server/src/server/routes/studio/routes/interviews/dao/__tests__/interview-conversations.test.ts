import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../../../lib/server/db/index";
import type { CandidateFormTemplateSnapshot } from "@app/db-schema/candidate-forms";
import type {
  InterviewContextSnapshotPayload,
  InterviewEvidenceSnapshotPayload,
} from "@app/db-schema/interview-snapshots";
import type { InterviewQuestionTemplateSnapshot } from "@app/db-schema/interview-question-templates";
import {
  interviewContextSnapshot,
  interviewConversation,
  interviewConversationTurn,
  interviewEvidenceSnapshot,
  organization,
  studioInterview,
  studioInterviewSchedule,
} from "@app/db-schema/schema";
import {
  queryInterviewConversationReportByRound,
  queryInterviewConversationReportsByRound,
} from "../interview-conversations";

const ORG_ID = "test_report_snapshot_metadata_org";
const INTERVIEW_ID = "test_report_snapshot_metadata_interview";
const ROUND_ID = "test_report_snapshot_metadata_round";
const CONTEXT_ID = "test_report_snapshot_metadata_context";
const CONVERSATION_ID = "test_report_snapshot_metadata_conversation";
const EVIDENCE_ID = "test_report_snapshot_metadata_evidence";
const NOW = new Date("2026-06-26T10:00:00.000Z");

const formSnapshot: CandidateFormTemplateSnapshot = {
  description: null,
  jobDescriptionIds: [],
  questions: [
    {
      displayMode: "textarea",
      helperText: null,
      id: "form-question-1",
      label: "期望薪资",
      options: [],
      required: true,
      sortOrder: 0,
      type: "text",
    },
  ],
  scope: "global",
  templateId: "form-template-1",
  title: "候选人信息表",
};

const questionTemplateSnapshot: InterviewQuestionTemplateSnapshot = {
  description: null,
  jobDescriptionIds: [],
  questions: [
    {
      content: "讲一次你处理线上问题的经历。",
      difficulty: "medium",
      id: "question-template-question-1",
      sortOrder: 0,
    },
    {
      content: "你如何设计一个高并发接口？",
      difficulty: "hard",
      id: "question-template-question-2",
      sortOrder: 1,
    },
  ],
  scope: "global",
  templateId: "question-template-1",
  title: "后端面试题",
};

const contextPayload: InterviewContextSnapshotPayload = {
  candidate: {
    candidateEmail: "meta-candidate@example.com",
    candidateName: "元信息候选人",
    candidatePhone: null,
    resumeProfile: null,
    targetRole: "后端工程师",
  },
  createdAt: NOW.toISOString(),
  forms: [
    {
      snapshot: formSnapshot,
      templateId: formSnapshot.templateId,
      version: 2,
      versionId: "form-version-2",
    },
  ],
  globalConfig: {
    closingInstructions: "礼貌结束",
    companyContext: "测试公司",
    openingInstructions: "礼貌开场",
  },
  interviewRecordId: INTERVIEW_ID,
  interviewers: [{ name: "AI 面试官", prompt: "结构化提问", voice: null }],
  jobDescription: {
    id: "jd-report-snapshot-metadata",
    name: "后端 JD",
    prompt: "后端岗位描述",
  },
  personalizedQuestions: [
    {
      difficulty: "easy",
      order: 1,
      question: "介绍一下你最近的项目。",
    },
  ],
  questionTemplates: [
    {
      bindingId: "binding-1",
      disabledByUser: false,
      scope: "global",
      snapshot: questionTemplateSnapshot,
      sortOrder: 0,
      templateId: questionTemplateSnapshot.templateId,
      version: 3,
      versionId: "question-version-3",
    },
  ],
  scheduleEntryId: ROUND_ID,
  schemaVersion: 1,
};

const evidencePayload: InterviewEvidenceSnapshotPayload = {
  context: contextPayload,
  contextSnapshotId: CONTEXT_ID,
  conversationId: CONVERSATION_ID,
  formSubmissions: [
    {
      answers: { "form-question-1": "30k" },
      snapshot: formSnapshot,
      submittedAt: NOW.toISOString(),
      templateId: formSnapshot.templateId,
      version: 2,
      versionId: "form-version-2",
    },
  ],
  generatedAt: NOW.toISOString(),
  interviewRecordId: INTERVIEW_ID,
  recording: {
    durationSecs: 120,
    egressId: null,
    fileKey: null,
    status: "completed",
  },
  scheduleEntryId: ROUND_ID,
  schemaVersion: 1,
  transcript: [
    { message: "请介绍一下自己。", role: "agent", timeInCallSecs: 1 },
    { message: "我是候选人。", role: "user", timeInCallSecs: 3 },
  ],
};

async function cleanup() {
  await db
    .delete(interviewEvidenceSnapshot)
    .where(eq(interviewEvidenceSnapshot.organizationId, ORG_ID));
  await db
    .delete(interviewConversationTurn)
    .where(eq(interviewConversationTurn.organizationId, ORG_ID));
  await db.delete(interviewConversation).where(eq(interviewConversation.organizationId, ORG_ID));
  await db
    .delete(interviewContextSnapshot)
    .where(eq(interviewContextSnapshot.organizationId, ORG_ID));
  await db
    .delete(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.organizationId, ORG_ID));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_ID));
  await db.delete(organization).where(eq(organization.id, ORG_ID));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG_ID,
    name: "Report Snapshot Metadata Org",
    slug: ORG_ID,
  });
  await db.insert(studioInterview).values({
    candidateEmail: "meta-candidate@example.com",
    candidateName: "元信息候选人",
    createdAt: NOW,
    id: INTERVIEW_ID,
    interviewQuestions: [],
    organizationId: ORG_ID,
    resumeProfile: null,
    targetRole: "后端工程师",
    updatedAt: NOW,
  });
  await db.insert(studioInterviewSchedule).values({
    allowTextInput: true,
    createdAt: NOW,
    id: ROUND_ID,
    interviewRecordId: INTERVIEW_ID,
    organizationId: ORG_ID,
    roundLabel: "一面",
    scheduledAt: NOW,
    sortOrder: 0,
    status: "completed",
    updatedAt: NOW,
  });
  await db.insert(interviewContextSnapshot).values({
    contentHash: "context-hash",
    createdAt: NOW,
    id: CONTEXT_ID,
    interviewRecordId: INTERVIEW_ID,
    organizationId: ORG_ID,
    payload: contextPayload,
    reason: "create",
    scheduleEntryId: ROUND_ID,
    status: "active",
    version: 4,
  });
  await db.insert(interviewConversation).values({
    agentId: "agent-report-snapshot-metadata",
    callSuccessful: "success",
    conversationId: CONVERSATION_ID,
    createdAt: NOW,
    endedAt: NOW,
    interviewRecordId: INTERVIEW_ID,
    keyInformation: {
      quantitativeInformation: [],
      risks: [],
      skillEvidence: [
        {
          content: "候选人介绍了后端开发经历。",
          evidence: [{ quote: "我是候选人。", timeInCallSecs: 3, turnIndex: 2 }],
        },
      ],
    },
    lastSyncedAt: NOW,
    metadata: {},
    metrics: {},
    mode: "voice",
    organizationId: ORG_ID,
    recordingDurationSecs: 120,
    recordingStatus: "completed",
    scheduleEntryId: ROUND_ID,
    startedAt: NOW,
    status: "done",
    transcript: evidencePayload.transcript,
    transcriptSummary: "候选人完成了面试。",
    updatedAt: NOW,
    webhookReceivedAt: NOW,
  });
  await db.insert(interviewConversationTurn).values([
    {
      conversationId: CONVERSATION_ID,
      createdAt: NOW,
      id: "test_report_snapshot_metadata_turn_agent",
      interviewRecordId: INTERVIEW_ID,
      message: "请介绍一下自己。",
      organizationId: ORG_ID,
      receivedAt: NOW,
      role: "agent",
      source: "post_call_transcription",
      timeInCallSecs: 1,
    },
    {
      conversationId: CONVERSATION_ID,
      createdAt: new Date("2026-06-26T10:00:03.000Z"),
      id: "test_report_snapshot_metadata_turn_user",
      interviewRecordId: INTERVIEW_ID,
      message: "我是候选人。",
      organizationId: ORG_ID,
      receivedAt: new Date("2026-06-26T10:00:03.000Z"),
      role: "user",
      source: "post_call_transcription",
      timeInCallSecs: 3,
    },
  ]);
  await db.insert(interviewEvidenceSnapshot).values({
    contentHash: "evidence-hash",
    contextSnapshotId: CONTEXT_ID,
    conversationId: CONVERSATION_ID,
    createdAt: NOW,
    id: EVIDENCE_ID,
    interviewRecordId: INTERVIEW_ID,
    organizationId: ORG_ID,
    payload: evidencePayload,
    scheduleEntryId: ROUND_ID,
  });
});

afterAll(cleanup);

function expectPresent<T>(value: T | null | undefined): T {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
  // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
  return value as T;
}

describe("queryInterviewConversationReportsByRound", () => {
  it("returns snapshot metadata only when explicitly requested", async () => {
    const [publicReport] = await queryInterviewConversationReportsByRound(ROUND_ID);

    expect(expectPresent(publicReport).snapshotMetadata).toBeUndefined();
    expect(expectPresent(publicReport).keyInformation).toBeNull();

    const [studioReport] = await queryInterviewConversationReportsByRound(ROUND_ID, {
      includeKeyInformation: true,
      includeSnapshotMetadata: true,
    });
    expect(expectPresent(studioReport).keyInformation?.skillEvidence[0]?.content).toBe(
      "候选人介绍了后端开发经历。",
    );
    const metadata = expectPresent(expectPresent(studioReport).snapshotMetadata);
    const fullTextInput = expectPresent(metadata.fullTextInput);

    expect(metadata.contextSnapshot?.id).toBe(CONTEXT_ID);
    expect(metadata.contextSnapshot?.version).toBe(4);
    expect(metadata.evidenceSnapshot?.id).toBe(EVIDENCE_ID);
    expect(metadata.evidenceSnapshot?.generatedAt).toBe(NOW.toISOString());
    expect(metadata.frozenInput).toMatchObject({
      candidateEmail: "meta-candidate@example.com",
      candidateName: "元信息候选人",
      formCount: 1,
      formQuestionCount: 1,
      formSubmissionCount: 1,
      interviewerCount: 1,
      jobDescriptionName: "后端 JD",
      personalizedQuestionCount: 1,
      questionTemplateCount: 1,
      questionTemplateQuestionCount: 2,
      targetRole: "后端工程师",
    });
    expect(metadata.session).toMatchObject({
      recordingDurationSecs: 120,
      recordingStatus: "completed",
      scheduleEntryId: ROUND_ID,
      transcriptTurnCount: 2,
    });
    expect(fullTextInput).toMatchObject({
      globalConfig: {
        closingInstructions: "礼貌结束",
        companyContext: "测试公司",
        openingInstructions: "礼貌开场",
      },
      jobDescription: {
        name: "后端 JD",
        prompt: "后端岗位描述",
      },
    });
    expect(fullTextInput.forms[0]?.questions[0]).toMatchObject({
      label: "期望薪资",
    });
    expect(fullTextInput.formSubmissions[0]?.answers[0]).toMatchObject({
      label: "期望薪资",
      valueText: "30k",
    });
    expect(fullTextInput.questionTemplates[0]?.questions[0]).toMatchObject({
      content: "讲一次你处理线上问题的经历。",
    });
    expect(fullTextInput.transcript[1]).toMatchObject({
      message: "我是候选人。",
      role: "user",
    });

    const selectedReport = await queryInterviewConversationReportByRound(
      ROUND_ID,
      CONVERSATION_ID,
      {
        includeKeyInformation: true,
        includeSnapshotMetadata: true,
      },
    );
    expect(expectPresent(selectedReport).keyInformation?.skillEvidence[0]?.content).toBe(
      "候选人介绍了后端开发经历。",
    );
    expect(expectPresent(selectedReport).snapshotMetadata?.evidenceSnapshot?.id).toBe(EVIDENCE_ID);
  });
});
