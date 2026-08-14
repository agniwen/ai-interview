import { describe, expect, it } from "vitest";
import {
  meetingIntelligencePayloadSchema,
  requestMeetingIntelligenceSchema,
  validateMeetingIntelligenceEvidence,
} from "./meeting-intelligence";

describe("Meeting Intelligence contract", () => {
  it("requires evidence on General decisions and action items", () => {
    expect(
      meetingIntelligencePayloadSchema.safeParse({
        actionItems: [{ dueDate: null, evidenceTurnIds: [], owner: null, task: "发送纪要" }],
        decisions: [{ evidenceTurnIds: [], statement: "采用方案 A" }],
        openQuestions: [],
        summary: "讨论了方案。",
        template: "general",
        topics: [],
      }).success,
    ).toBe(false);
  });

  it("requires transcript evidence on recruiting candidate statements", () => {
    expect(
      meetingIntelligencePayloadSchema.safeParse({
        candidateStatements: [
          {
            attribution: "candidate",
            evidenceTurnIds: [],
            statement: "候选人表示负责过支付项目",
            verification: "stated",
          },
        ],
        followUpActions: [],
        keyExperience: [],
        summary: "讨论了候选人经验。",
        template: "recruiting-interview",
        verificationItems: [],
      }).success,
    ).toBe(false);
  });

  it("rejects recruiting output that contains an automatic hiring decision", () => {
    for (const summary of [
      "综合判断后，建议录用该候选人。",
      "建议该候选人通过本轮面试。",
      "决定通过该候选人。",
      "Move the candidate to the next round.",
    ]) {
      expect(
        meetingIntelligencePayloadSchema.safeParse({
          candidateStatements: [],
          followUpActions: [],
          keyExperience: [],
          summary,
          template: "recruiting-interview",
          verificationItems: [],
        }).success,
      ).toBe(false);
    }
    expect(
      meetingIntelligencePayloadSchema.safeParse({
        candidateStatements: [],
        followUpActions: [],
        keyExperience: [],
        summary: "候选人表示自己通过了云计算认证。",
        template: "recruiting-interview",
        verificationItems: [],
      }).success,
    ).toBe(true);
    for (const summary of [
      "面试官建议候选人通过本次云计算认证。",
      "The candidate recommended that the team hire more engineers.",
      "We should pass the candidate details to the recruiter.",
    ]) {
      expect(
        meetingIntelligencePayloadSchema.safeParse({
          candidateStatements: [],
          followUpActions: [],
          keyExperience: [],
          summary,
          template: "recruiting-interview",
          verificationItems: [],
        }).success,
      ).toBe(true);
    }
  });

  it("rejects evidence references outside the exact transcript revision", () => {
    const payload = meetingIntelligencePayloadSchema.parse({
      actionItems: [],
      decisions: [{ evidenceTurnIds: ["turn-missing"], statement: "采用方案 A" }],
      openQuestions: [],
      summary: "讨论了方案。",
      template: "general",
      topics: [],
    });
    expect(validateMeetingIntelligenceEvidence(payload, new Set(["turn-1"]))).toBe(false);
    expect(validateMeetingIntelligenceEvidence(payload, new Set(["turn-missing"]))).toBe(true);
  });

  it("accepts only product-owned templates for manual regeneration", () => {
    expect(requestMeetingIntelligenceSchema.safeParse({ template: "general" }).success).toBe(true);
    expect(requestMeetingIntelligenceSchema.safeParse({ template: "custom" }).success).toBe(false);
  });
});
