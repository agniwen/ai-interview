/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion, promise/prefer-await-to-callbacks, unicorn/consistent-function-scoping -- The test harness deliberately captures callback-shaped AI SDK seams and inspects opaque provider payloads after controlled fake construction. */
import { Agent } from "@mastra/core/agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InterviewEvidenceSnapshotPayload } from "@arc/db-schema/interview-snapshots";
import { AgentJobsService } from "./agent-jobs.service.js";

describe("AgentJobsService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const agentOutput = (value: unknown) =>
    value as Awaited<ReturnType<InstanceType<typeof Agent>["generate"]>>;

  it("persists both the summary and structured evaluation contract", async () => {
    vi.stubEnv("INTERVIEW_NOTIFICATION_FLOW_ENABLED", "false");
    const writes: Record<string, unknown>[] = [];
    const claimedConversation = {
      dataCollectionResults: {
        questions: [
          {
            answerSummary: "降低失败率",
            followUpCount: 0,
            question: "项目成果",
            questionId: "q1",
            status: "answered",
          },
        ],
        schemaVersion: 2,
      },
      transcript: [
        { message: "请介绍最近的项目", role: "agent" },
        { message: "我负责支付系统迁移并将失败率降到千分之一。", role: "user" },
      ],
    };
    const database = {
      transaction: async (callback: (transaction: never) => Promise<unknown>) =>
        callback(database as never),
      update: () => ({
        set: (value: Record<string, unknown>) => {
          writes.push(value);
          return {
            where: () => ({
              returning: async () =>
                value.summaryStatus === "running"
                  ? [claimedConversation]
                  : [{ conversationId: "conversation-1" }],
            }),
          };
        },
      }),
    };
    const service = new AgentJobsService(database as never);
    vi.spyOn(service, "createEvidenceSnapshot").mockResolvedValue({
      context: { questionTemplates: [] },
      formSubmissions: [],
    } as unknown as InterviewEvidenceSnapshotPayload);
    vi.spyOn(Agent.prototype, "generate")
      .mockResolvedValueOnce(agentOutput({ text: "候选人完成了支付系统迁移。" }))
      .mockResolvedValueOnce(
        agentOutput({
          object: {
            hrEvaluation: {
              availability: null,
              careerProgression: null,
              compensationExpectations: null,
              jobMotivation: null,
              overseasTravel: null,
              projectHighlights: "支付系统迁移",
              recentWork: null,
            },
            overallAssessment: "候选人给出了可验证的项目成果。",
            overallScore: 80,
            questions: [],
            recommendation: "建议进入下一轮",
          },
          text: "",
        }),
      );

    await service.runSummary({
      conversationId: "conversation-1",
      interviewRecordId: "interview-1",
    });

    expect(writes.map((write) => write.summaryStatus).filter(Boolean)).toEqual([
      "running",
      "ready",
    ]);
    expect(writes[1]).toMatchObject({
      evaluationCriteriaResults: {
        overallAssessment: "候选人给出了可验证的项目成果。",
        recommendation: "建议进入下一轮",
      },
      transcriptSummary: "候选人完成了支付系统迁移。",
    });
  });
});
