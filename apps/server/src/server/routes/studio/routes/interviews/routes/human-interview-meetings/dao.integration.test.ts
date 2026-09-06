import {
  createRecruitingRecords,
  updateRecruitingRecords,
  deleteRecruitingRecords,
} from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadHumanInterviewRecognitionDocuments } from "@app/meeting-processing/human-interview";
import {
  department,
  jobDescription,
  organization,
  user,
  humanInterviewRound,
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
} from "@app/db-schema/schema";
import { db } from "../../../../../../../lib/server/db";
import {
  markHumanInterviewEvaluationFailed,
  requestHumanInterviewEvaluation,
} from "../../dao/human-interview-evaluation";
import { loadHumanInterviewMeetingDetail } from "./dao";

const prefix = "meeting_detail_test_";
const orgId = `${prefix}org`;
const creatorId = `${prefix}creator`;
const otherId = `${prefix}other`;
const candidateId = `${prefix}candidate`;
const roundId = `${prefix}round`;
const meetingId = `${prefix}meeting`;
const sessionId = `${prefix}session`;
const sourceId = `${prefix}source`;
const correctedId = `${prefix}corrected`;
const now = new Date("2026-09-03T00:00:00Z");
const input = {
  candidateId,
  meetingId,
  organizationId: orgId,
  roundId,
  visibility: { kind: "all" as const },
};
const evaluation = {
  detailedAnalysis: "本轮分析",
  evidenceTurnIds: [],
  overallEvaluation: "本轮评价",
  professionalSkill: "良",
  rating: "B" as const,
  risks: "待验证",
  rolePosition: "工程师",
  salaryRecommendation: "",
  seniorityPosition: "高级",
  strengths: "项目经验",
};

async function cleanup() {
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(inArray(user.id, [creatorId, otherId]));
}
beforeAll(async () => {
  await cleanup();
  await db.insert(user).values(
    [creatorId, otherId].map((id) => ({
      createdAt: now,
      email: `${id}@example.test`,
      emailVerified: false,
      id,
      name: id,
      updatedAt: now,
    })),
  );
  await db.insert(organization).values({ createdAt: now, id: orgId, name: orgId, slug: orgId });
  await createRecruitingRecords(db, {
    candidateName: "测试候选人",
    createdBy: creatorId,
    id: candidateId,
    interviewQuestions: [],
    organizationId: orgId,
    outcome: "archived",
    pipelineStage: "closed",
  });
  await db.insert(meetingSession).values({
    id: sessionId,
    manifestSha256: "test",
    organizationId: orgId,
    ownerId: creatorId,
    savedAt: now,
    startedAt: now,
    status: "ready",
    title: "测试面试",
    transcriptionStatus: "ready",
  });
  await db.insert(meetingTranscriptRevision).values(
    [sourceId, correctedId].map((id, i) => ({
      id,
      kind: "human",
      meetingId: sessionId,
      model: "test",
      organizationId: orgId,
      pipelineVersion: "test",
      provider: "manual",
      region: "test",
      revision: i + 1,
      sourceManifestSha256: "test",
    })),
  );
  await db.insert(meetingTranscriptTurn).values([
    {
      endMs: 4000,
      id: `${prefix}source_turn_2`,
      revisionId: sourceId,
      sequence: 1,
      speakerKey: "remote-2",
      startMs: 3000,
      text: "身份未确认的回答",
      track: "remote",
    },
    {
      endMs: 2000,
      id: `${prefix}source_turn_1`,
      revisionId: sourceId,
      sequence: 0,
      speakerDisplayName: "面试官",
      speakerKey: "local-1",
      startMs: 1000,
      text: "原始问题",
      track: "local",
    },
    {
      endMs: 2000,
      id: `${prefix}corrected_turn`,
      revisionId: correctedId,
      sequence: 0,
      speakerKey: "remote-1",
      startMs: 1000,
      text: "修订后的文本",
      track: "remote",
    },
  ]);
  await db
    .update(meetingSession)
    .set({ activeTranscriptRevisionId: correctedId })
    .where(eq(meetingSession.id, sessionId));
  await db.insert(humanInterviewRound).values({
    evaluation,
    evaluationStatus: "submitted",
    evaluationSubmittedAt: now,
    evaluationTranscriptRevisionId: sourceId,
    format: "online",
    id: roundId,
    label: "业务一面",
    organizationId: orgId,
    outcome: "pass",
    recruitingRecordId: candidateId,
    roundKind: "second_interview",
    status: "completed",
  });
  await db.insert(humanInterviewMeeting).values({
    endedAt: now,
    id: meetingId,
    organizationId: orgId,
    processingMeetingSessionId: sessionId,
    status: "ended",
    title: "测试面试",
  });
  await db.insert(humanInterviewMeetingRound).values({ meetingId, organizationId: orgId, roundId });
});
afterAll(cleanup);

describe("human interview recognition context", () => {
  it("uses only the linked candidate and canonical JD within the job scope", async () => {
    const departmentId = `${prefix}department`;
    const jobId = `${prefix}job`;
    await db.insert(department).values({ id: departmentId, name: "业务", organizationId: orgId });
    await db.insert(jobDescription).values({
      departmentId,
      description: "不得使用的旧描述",
      id: jobId,
      name: "运营经理",
      organizationId: orgId,
      prompt: "负责投放归因与留存",
    });
    await updateRecruitingRecords(db, eq(recruitingRecordReadModel.id, candidateId), {
      interviewQuestions: [{ difficulty: "medium", order: 1, question: "如何衡量转化率？" }],
      jobDescriptionId: jobId,
      resumeText: "做过 IM 即时通信项目",
    });
    await createRecruitingRecords(db, {
      candidateName: "其他候选人",
      id: `${prefix}unlinked`,
      interviewQuestions: [],
      organizationId: orgId,
      resumeText: "无关材料不能进入当前会议",
    });
    const scope = { meetingId: sessionId, organizationId: orgId, sourceManifestSha256: "test" };
    try {
      expect(await loadHumanInterviewRecognitionDocuments(db, scope)).toEqual([
        "运营经理\n负责投放归因与留存",
        "做过 IM 即时通信项目",
        "如何衡量转化率？",
      ]);
      for (const mismatch of [
        { organizationId: "other-org" },
        { meetingId: "other-session" },
        { sourceManifestSha256: "obsolete" },
      ]) {
        expect(await loadHumanInterviewRecognitionDocuments(db, { ...scope, ...mismatch })).toEqual(
          [],
        );
      }
      await db.update(jobDescription).set({ prompt: "" }).where(eq(jobDescription.id, jobId));
      const documents = await loadHumanInterviewRecognitionDocuments(db, scope);
      expect(documents.join("\n")).not.toContain("不得使用的旧描述");
    } finally {
      await updateRecruitingRecords(db, eq(recruitingRecordReadModel.id, candidateId), {
        interviewQuestions: [],
        jobDescriptionId: null,
        resumeText: null,
      });
      await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.id, `${prefix}unlinked`));
      await db.delete(jobDescription).where(eq(jobDescription.id, jobId));
      await db.delete(department).where(eq(department.id, departmentId));
    }
  });
});

describe("meeting detail database boundary", () => {
  it("does not show an ingest recovery warning after final transcription succeeds", async () => {
    await db
      .update(humanInterviewMeeting)
      .set({
        recordingError: "部分录音不完整，已保留可用音轨；全场补救中的身份不明内容需要人工确认。",
        recordingStatus: "completed",
      })
      .where(eq(humanInterviewMeeting.id, meetingId));
    try {
      const detail = await loadHumanInterviewMeetingDetail(input);
      expect(detail).toMatchObject({
        recordingNotice: null,
        transcript: { id: sourceId },
        transcriptionError: null,
        transcriptionState: "ready",
      });
    } finally {
      await db
        .update(humanInterviewMeeting)
        .set({
          recordingError: null,
          recordingStatus: "pending",
        })
        .where(eq(humanInterviewMeeting.id, meetingId));
    }
  });

  it.each([
    ["ready", "转录已完成，部分内容可能缺失或发言人身份待确认。"],
    ["failed", "转录处理遇到问题，已保存的内容仍可查看。"],
  ] as const)(
    "shows one accurate notice when transcription is %s",
    async (transcriptionStatus, notice) => {
      await db
        .update(humanInterviewMeeting)
        .set({ recordingError: "录音补救提示" })
        .where(eq(humanInterviewMeeting.id, meetingId));
      await db
        .update(meetingSession)
        .set({ transcriptionError: "内部处理详情", transcriptionStatus })
        .where(eq(meetingSession.id, sessionId));
      try {
        expect(await loadHumanInterviewMeetingDetail(input)).toMatchObject({
          recordingNotice: null,
          transcript: { id: sourceId },
          transcriptionError: notice,
          transcriptionState: transcriptionStatus,
        });
      } finally {
        await db
          .update(humanInterviewMeeting)
          .set({ recordingError: null })
          .where(eq(humanInterviewMeeting.id, meetingId));
        await db
          .update(meetingSession)
          .set({ transcriptionError: null, transcriptionStatus: "ready" })
          .where(eq(meetingSession.id, sessionId));
      }
    },
  );

  it("reads an ended meeting for an authorized HR reader even after the candidate closes", async () => {
    // No meeting interviewer membership is inserted for either user.
    const detail = await loadHumanInterviewMeetingDetail({
      ...input,
      visibility: { kind: "restricted", userIds: [creatorId] },
    });
    expect(detail).toMatchObject({
      candidateId,
      endedAt: now.toISOString(),
      evaluationStatus: "submitted",
      meetingId,
      roundId,
    });
    expect(detail).not.toHaveProperty("recordingFileKey");
    expect(detail).not.toHaveProperty("liveKitRoomName");
  });

  it("keeps a recording failure visible when a saved transcript is available", async () => {
    await db
      .update(humanInterviewMeeting)
      .set({
        recordingError: "录音文件丢失",
        recordingStatus: "failed",
      })
      .where(eq(humanInterviewMeeting.id, meetingId));
    try {
      expect(await loadHumanInterviewMeetingDetail(input)).toMatchObject({
        recordingNotice: "录音处理未完成，当前展示已保存的内容，可能存在遗漏。",
        transcript: { id: sourceId },
        transcriptionState: "ready",
      });
    } finally {
      await db
        .update(humanInterviewMeeting)
        .set({
          recordingError: null,
          recordingStatus: "pending",
        })
        .where(eq(humanInterviewMeeting.id, meetingId));
    }
  });
  it("uses the evaluation's transcript in sequence order, including unknown voices", async () => {
    const detail = await loadHumanInterviewMeetingDetail(input);
    expect(detail?.transcript?.id).toBe(sourceId);
    expect(detail?.transcript?.turns.map((turn) => turn.text)).toEqual([
      "原始问题",
      "身份未确认的回答",
    ]);
    expect(detail?.transcript?.turns[0]).toMatchObject({ endMs: 2000, startMs: 1000 });
    expect(detail?.transcriptBasis).toBe("evaluation");
    expect(detail?.transcriptNotice).toContain("修订");
  });
  it("does not pair the retained draft with the new transcript during or after a failed regeneration", async () => {
    await db
      .update(humanInterviewRound)
      .set({ evaluationStatus: "draft", status: "pending" })
      .where(eq(humanInterviewRound.id, roundId));
    try {
      const job = await requestHumanInterviewEvaluation({
        force: true,
        meetingSessionId: sessionId,
        organizationId: orgId,
      });
      expect(job?.transcriptRevisionId).toBe(correctedId);
      for (const status of ["generating", "failed"] as const) {
        if (status === "failed") {
          await markHumanInterviewEvaluationFailed({
            error: "test generation failed",
            roundId,
            transcriptRevisionId: correctedId,
          });
        }
        const detail = await loadHumanInterviewMeetingDetail(input);
        expect(detail).toMatchObject({
          evaluation,
          evaluationStatus: status,
          transcriptBasis: "unlinked",
        });
        expect(detail?.transcript?.id).toBe(correctedId);
        expect(detail?.transcriptNotice).toContain("旧稿");
      }
    } finally {
      await db
        .update(humanInterviewRound)
        .set({
          evaluationError: null,
          evaluationStatus: "submitted",
          evaluationTranscriptRevisionId: sourceId,
          status: "completed",
        })
        .where(eq(humanInterviewRound.id, roundId));
    }
  });
  it("rejects other workspaces, candidates, rounds, meetings and hidden records", async () => {
    for (const patch of [
      { organizationId: "wrong" },
      { candidateId: "wrong" },
      { roundId: "wrong" },
      { meetingId: "wrong" },
    ]) {
      expect(await loadHumanInterviewMeetingDetail({ ...input, ...patch })).toBeNull();
    }
    expect(
      await loadHumanInterviewMeetingDetail({ ...input, visibility: { kind: "none" } }),
    ).toBeNull();
    expect(
      await loadHumanInterviewMeetingDetail({
        ...input,
        visibility: { kind: "restricted", userIds: [otherId] },
      }),
    ).toBeNull();
  });
  it("does not expose a historical group transcript containing an inaccessible candidate", async () => {
    const hiddenCandidate = `${prefix}hidden_candidate`;
    const hiddenRound = `${prefix}hidden_round`;
    await createRecruitingRecords(db, {
      candidateName: "另一候选人",
      createdBy: otherId,
      id: hiddenCandidate,
      interviewQuestions: [],
      organizationId: orgId,
    });
    await db.insert(humanInterviewRound).values({
      format: "online",
      id: hiddenRound,
      label: "旧群面",
      organizationId: orgId,
      recruitingRecordId: hiddenCandidate,
      roundKind: "second_interview",
    });
    await db
      .insert(humanInterviewMeetingRound)
      .values({ meetingId, organizationId: orgId, roundId: hiddenRound });
    try {
      expect(
        await loadHumanInterviewMeetingDetail({
          ...input,
          visibility: { kind: "restricted", userIds: [creatorId] },
        }),
      ).toBeNull();
      expect(await loadHumanInterviewMeetingDetail(input)).not.toBeNull();
    } finally {
      await db
        .delete(humanInterviewMeetingRound)
        .where(
          and(
            eq(humanInterviewMeetingRound.meetingId, meetingId),
            eq(humanInterviewMeetingRound.roundId, hiddenRound),
          ),
        );
    }
  });
  it.each(["scheduled", "in_progress", "cancelled"] as const)(
    "does not show %s meetings",
    async (status) => {
      await db
        .update(humanInterviewMeeting)
        .set({ status })
        .where(eq(humanInterviewMeeting.id, meetingId));
      try {
        expect(await loadHumanInterviewMeetingDetail(input)).toBeNull();
      } finally {
        await db
          .update(humanInterviewMeeting)
          .set({ status: "ended" })
          .where(eq(humanInterviewMeeting.id, meetingId));
      }
    },
  );
  it("keeps legacy evaluation readable and labels its unlinked transcript", async () => {
    await db
      .update(humanInterviewRound)
      .set({ evaluationTranscriptRevisionId: null })
      .where(eq(humanInterviewRound.id, roundId));
    try {
      const detail = await loadHumanInterviewMeetingDetail(input);
      expect(detail?.transcript?.id).toBe(correctedId);
      expect(detail?.transcriptBasis).toBe("unlinked");
      expect(detail?.transcriptNotice).toContain("历史评价");
    } finally {
      await db
        .update(humanInterviewRound)
        .set({ evaluationTranscriptRevisionId: sourceId })
        .where(eq(humanInterviewRound.id, roundId));
    }
  });
  it("keeps an evaluation visible when the meeting has no transcript storage", async () => {
    await db
      .update(humanInterviewMeeting)
      .set({ processingMeetingSessionId: null, recordingError: "录音缺失" })
      .where(eq(humanInterviewMeeting.id, meetingId));
    try {
      expect(await loadHumanInterviewMeetingDetail(input)).toMatchObject({
        evaluation,
        recordingNotice: "录音处理未完成，当前展示已保存的内容，可能存在遗漏。",
        transcript: null,
      });
    } finally {
      await db
        .update(humanInterviewMeeting)
        .set({ processingMeetingSessionId: sessionId, recordingError: null })
        .where(eq(humanInterviewMeeting.id, meetingId));
    }
  });
  it("reports no transcript when an ended meeting never recorded or queued processing", async () => {
    await db
      .update(humanInterviewMeeting)
      .set({ processingMeetingSessionId: null })
      .where(eq(humanInterviewMeeting.id, meetingId));
    try {
      expect(await loadHumanInterviewMeetingDetail(input)).toMatchObject({
        evaluation,
        transcript: null,
        transcriptionState: "unavailable",
      });
    } finally {
      await db
        .update(humanInterviewMeeting)
        .set({ processingMeetingSessionId: sessionId })
        .where(eq(humanInterviewMeeting.id, meetingId));
    }
  });
  it.each(["starting", "active", "completed"] as const)(
    "keeps waiting when recording is %s and processing has not created a session yet",
    async (recordingStatus) => {
      await db
        .update(humanInterviewMeeting)
        .set({ processingMeetingSessionId: null, recordingStatus })
        .where(eq(humanInterviewMeeting.id, meetingId));
      try {
        expect(await loadHumanInterviewMeetingDetail(input)).toMatchObject({
          transcript: null,
          transcriptionState: "pending",
        });
      } finally {
        await db
          .update(humanInterviewMeeting)
          .set({ processingMeetingSessionId: sessionId, recordingStatus: "pending" })
          .where(eq(humanInterviewMeeting.id, meetingId));
      }
    },
  );
});
