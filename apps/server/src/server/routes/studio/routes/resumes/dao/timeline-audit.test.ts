import { describe, expect, it } from "vitest";
import { auditDescription, auditTitle, auditTone } from "./timeline-audit";

describe("auditDescription", () => {
  it("accepts persisted nullable audit fields", () => {
    expect(
      auditDescription(
        {
          fromJobDescriptionId: null,
          fromJobDescriptionName: null,
          reason: null,
          toJobDescriptionId: null,
          toJobDescriptionName: null,
        },
        "resume_evaluation_reset_for_job_change",
      ),
    ).toBe("岗位变更后需重新评估");
  });
  it("新节点事件完整中文描述，确认筛选与推进分别呈现", () => {
    expect(
      auditDescription(
        { node: "screening", result: "pass", status: "completed" },
        "recruiting_node_updated",
      ),
    ).toBe("简历筛选：通过");
    expect(
      auditDescription(
        { fromStage: "screening", skippedNodes: ["ai_interview"], toStage: "second_interview" },
        "recruiting_node_advanced",
      ),
    ).toBe("简历筛选 → 复试，跳过：AI 初面");
    expect(
      auditDescription(
        { fromStage: "closed", reason: "重新确认", toStage: "onboarding" },
        "recruiting_reopened",
      ),
    ).toBe("已结束 → 入职，恢复为待处理，原因：重新确认");
    expect(
      auditDescription(
        { fromStage: "onboarding", reasonCode: "onboarded", toOutcome: "hired" },
        "recruiting_closed",
      ),
    ).toBe("入职 → 已结束，结论：已入职");
    expect(auditTitle("recruiting_node_advanced")).toBe("招聘阶段推进");
    expect(auditTone("recruiting_closed", { toOutcome: "rejected" })).toBe("danger");
    expect(auditTone("recruiting_node_updated", { result: "pass" })).toBe("success");
  });
  it("历史人类面试、Offer结论显示中文，旧阶段字段可读", () => {
    expect(
      auditDescription({ outcome: "fail", roundLabel: "复试" }, "human_interview_round_completed"),
    ).toContain("结果：淘汰");
    expect(auditDescription({ response: "accepted" }, "offer_draft_responded")).toContain("已接受");
    expect(auditDescription({ response: "counter" }, "offer_draft_responded")).toContain(
      "继续谈薪",
    );
    expect(
      auditDescription({ fromStage: "human_interview", toStage: "offer" }, "candidate_transition"),
    ).toContain("真人面试");
    expect(
      auditDescription({ fromStatus: "scheduled", toStatus: "completed" }, "round_reset"),
    ).toContain("已重置");
  });
});
