import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  humanInterviewEvaluationSchema,
  humanInterviewMeetingInputSchema,
} from "@arc/db-schema/studio-interviews";

describe("human interview contract", () => {
  it("保留历史群面数据，同时仅在新建会议输入上限制单轮次", () => {
    const migration = readFileSync(
      new URL(
        "../../../../../../../../web/drizzle/20260831163000_human_interview_recording_evaluation/migration.sql",
        import.meta.url,
      ),
      "utf-8",
    );
    const schema = readFileSync(
      new URL("../../../../../../../../../packages/db-schema/src/schema.ts", import.meta.url),
      "utf-8",
    );

    expect(migration).not.toContain("RAISE EXCEPTION");
    expect(migration).not.toContain(
      'CREATE UNIQUE INDEX "studio_human_interview_meeting_round_meeting_uq"',
    );
    expect(schema).not.toContain(
      'uniqueIndex("studio_human_interview_meeting_round_meeting_uq").on(table.meetingId)',
    );
  });

  it("一场会议只接受一个候选人轮次", () => {
    const base = { scheduledAt: null, title: "技术复面", validUntil: null };
    expect(
      humanInterviewMeetingInputSchema.safeParse({ ...base, roundIds: ["round-1"] }).success,
    ).toBe(true);
    expect(
      humanInterviewMeetingInputSchema.safeParse({
        ...base,
        roundIds: ["round-1", "round-2"],
      }).success,
    ).toBe(false);
  });

  it("接受 SABC 评价并始终要求可编辑的薪资建议字段", () => {
    const evaluation = {
      detailedAnalysis: "基于完整对话的详细分析。",
      evidenceTurnIds: ["turn-1"],
      overallEvaluation: "整体匹配岗位要求。",
      professionalSkill: "优",
      rating: "S",
      risks: "仍需确认线上规模。",
      rolePosition: "核心方案负责人",
      salaryRecommendation: "",
      seniorityPosition: "高级专家",
      strengths: "架构思路清晰。",
    };
    expect(humanInterviewEvaluationSchema.parse(evaluation)).toEqual(evaluation);
    const { salaryRecommendation: _salaryRecommendation, ...withoutSalary } = evaluation;
    expect(humanInterviewEvaluationSchema.safeParse(withoutSalary).success).toBe(false);
  });
});
