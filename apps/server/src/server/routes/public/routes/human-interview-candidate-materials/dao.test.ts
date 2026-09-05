import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  interviewConversation,
  organization,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioInterview,
  user,
} from "@app/db-schema/schema";
import { db } from "../../../../../lib/server/db/index";
import { loadHumanInterviewCandidateHrInformation } from "./dao";
import type { HumanInterviewCandidateMaterialsScope } from "./dao";

const org = `materials-history-${crypto.randomUUID()}`;
const otherOrg = `${org}-other`;
const actor = `${org}-user`;
const candidate = `${org}-candidate`;
const otherCandidate = `${org}-other-candidate`;
const meeting = `${org}-meeting`;
const submittedAt = new Date("2026-09-01T10:00:00Z");
const evaluation = {
  detailedAnalysis: "内部完整分析",
  evidenceTurnIds: ["private-turn"],
  overallEvaluation: "内部整体评价",
  professionalSkill: "良",
  rating: "B" as const,
  risks: "缺少大规模团队经验",
  rolePosition: "主导决策者",
  salaryRecommendation: "30K",
  seniorityPosition: "小组主管",
  strengths: "工程实践扎实",
};
// SAFETY: This DAO uses only meetingId and organizationId from the authorized link scope.
const scope = { meetingId: meeting, organizationId: org } as HumanInterviewCandidateMaterialsScope;

beforeAll(async () => {
  await db.insert(user).values({ email: `${actor}@example.com`, id: actor, name: "测试面试官" });
  await db
    .insert(organization)
    .values(
      [org, otherOrg].map((id) => ({ createdAt: new Date(), id, name: "历史评价测试", slug: id })),
    );
  await db.insert(studioInterview).values(
    [candidate, otherCandidate].map((id) => ({
      candidateName: "测试候选人",
      createdBy: actor,
      id,
      organizationId: org,
    })),
  );
  const rounds = [
    { id: "first", label: "自定义技术面", sortOrder: 0 },
    { id: "second", label: "业务二面", outcome: "fail" as const, sortOrder: 1 },
    { evaluationStatus: "draft" as const, id: "draft", sortOrder: 2 },
    { id: "cancelled", sortOrder: 3, status: "cancelled" as const },
    { evaluation: null, evaluationStatus: "not_started" as const, id: "legacy", sortOrder: 4 },
    { id: "current", sortOrder: 5 },
    { id: "future", sortOrder: 6 },
    { id: "other-record", interviewRecordId: otherCandidate, sortOrder: 0 },
    { id: "other-org", organizationId: otherOrg, sortOrder: 0 },
  ];
  for (const round of rounds) {
    await db.insert(studioHumanInterviewRound).values({
      evaluation,
      evaluationStatus: "submitted",
      evaluationSubmittedAt: submittedAt,
      evaluationUpdatedBy: actor,
      format: "online",
      interviewRecordId: candidate,
      label: round.id,
      organizationId: org,
      outcome: "pass",
      status: "completed",
      ...round,
      id: `${org}-${round.id}`,
    });
  }
  await db.insert(studioHumanInterviewMeeting).values({
    id: meeting,
    organizationId: org,
    title: "测试会议",
  });
  await db.insert(studioHumanInterviewMeetingRound).values({
    meetingId: meeting,
    roundId: `${org}-current`,
  });
});

afterAll(async () => {
  await db.delete(organization).where(inArray(organization.id, [org, otherOrg]));
  await db.delete(user).where(eq(user.id, actor));
});

describe("interviewer candidate evaluation history", () => {
  it("keeps HR initial information alongside submitted business evaluations", async () => {
    const values = {
      availability: "一个月内到岗",
      careerProgression: null,
      compensationExpectations: null,
      jobMotivation: "寻找技术管理机会",
      overseasTravel: null,
      projectHighlights: null,
      recentWork: null,
    };
    const conversationId = `${org}-hr`;
    await db.insert(interviewConversation).values({
      conversationId,
      evaluationCriteriaResults: { hrEvaluation: values },
      interviewRecordId: candidate,
      organizationId: org,
      summaryStatus: "ready",
      updatedAt: submittedAt,
    });
    try {
      const result = await loadHumanInterviewCandidateHrInformation({
        candidateId: candidate,
        scope,
      });
      expect(result?.hrInitialInformation).toEqual({
        conversationId,
        generatedAt: submittedAt.toISOString(),
        roundLabel: null,
        values,
      });
      expect(result?.previousEvaluations.map((round) => round.roundId)).toEqual([
        `${org}-first`,
        `${org}-second`,
      ]);
    } finally {
      await db
        .delete(interviewConversation)
        .where(eq(interviewConversation.conversationId, conversationId));
    }
  });

  it("rejects a candidate or workspace outside the meeting", async () => {
    expect(
      await loadHumanInterviewCandidateHrInformation({ candidateId: otherCandidate, scope }),
    ).toBeNull();
    expect(
      await loadHumanInterviewCandidateHrInformation({
        candidateId: candidate,
        scope: { ...scope, organizationId: otherOrg },
      }),
    ).toBeNull();
  });

  it("keeps an old first-round link empty even after subsequent rounds are submitted", async () => {
    const firstMeeting = `${org}-first-meeting`;
    await db
      .insert(studioHumanInterviewMeeting)
      .values({ id: firstMeeting, organizationId: org, title: "一面会议" });
    await db
      .insert(studioHumanInterviewMeetingRound)
      .values({ meetingId: firstMeeting, roundId: `${org}-first` });
    expect(
      await loadHumanInterviewCandidateHrInformation({
        candidateId: candidate,
        scope: { ...scope, meetingId: firstMeeting },
      }),
    ).toEqual({ hrInitialInformation: null, previousEvaluations: [] });
  });

  it("returns only earlier submitted evaluations for this recruiting record and workspace", async () => {
    const result = await loadHumanInterviewCandidateHrInformation({
      candidateId: candidate,
      scope,
    });

    expect(result).toEqual({
      hrInitialInformation: null,
      previousEvaluations: [
        {
          outcome: "pass",
          roundId: `${org}-first`,
          roundLabel: "自定义技术面",
          submittedAt: submittedAt.toISOString(),
          submittedBy: "测试面试官",
          values: {
            professionalSkill: "良",
            rating: "B",
            risks: "缺少大规模团队经验",
            rolePosition: "主导决策者",
            salaryRecommendation: "30K",
            seniorityPosition: "小组主管",
            strengths: "工程实践扎实",
          },
        },
        {
          outcome: "fail",
          roundId: `${org}-second`,
          roundLabel: "业务二面",
          submittedAt: submittedAt.toISOString(),
          submittedBy: "测试面试官",
          values: {
            professionalSkill: "良",
            rating: "B",
            risks: "缺少大规模团队经验",
            rolePosition: "主导决策者",
            salaryRecommendation: "30K",
            seniorityPosition: "小组主管",
            strengths: "工程实践扎实",
          },
        },
      ],
    });
  });
});
