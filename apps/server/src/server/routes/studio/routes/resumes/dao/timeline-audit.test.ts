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
  it("显示误发邮件后的 Offer 链接作废记录", () => {
    expect(auditTitle("offer_link_revoked")).toBe("Offer 链接已作废");
    expect(auditDescription({ reason: "撤回误发邮件中的 Offer 链接" }, "offer_link_revoked")).toBe(
      "旧 Offer 链接已作废并生成新链接，原因：撤回误发邮件中的 Offer 链接",
    );
    expect(auditTone("offer_link_revoked")).toBe("warning");
  });
  it("显示背调采集全过程的活动记录", () => {
    expect(auditTitle("background_check_collection_created")).toBe("创建背调信息采集");
    expect(auditDescription({}, "background_check_link_copied")).toBe("HR 已复制背调信息采集链接");
    expect(auditDescription({}, "background_check_link_accessed")).toBe(
      "候选人已打开背景调查信息采集页面",
    );
    expect(auditDescription({ to: "candidate@example.com" }, "background_check_email_sent")).toBe(
      "已向 candidate@example.com 发送背调信息采集邮件",
    );
    expect(auditDescription({}, "background_check_submitted_by_candidate")).toBe(
      "候选人已在线提交背景调查信息，等待 HR 确认结果",
    );
    expect(auditTone("background_check_submitted_by_candidate")).toBe("success");
    expect(auditTone("background_check_email_send_failed")).toBe("danger");
  });
});
