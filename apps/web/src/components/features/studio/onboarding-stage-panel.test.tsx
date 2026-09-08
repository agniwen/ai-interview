import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import { OnboardingStagePanel } from "./onboarding-stage-panel";

it("已入职展示入职日期与最终结果，不再提示确认入职", () => {
  // SAFETY: 此展示组件只读取这里提供的办理节点、期望和结束信息。
  const record = {
    candidateExpectationsMeta: null,
    closedMeta: {
      hiredDetails: {
        actualJoiningDate: "2026-09-08",
        finalBaseSalary: 0,
        finalPosition: "工程师",
      },
    },
    closedReason: "已核实到岗",
    nodeStates: [{ node: "onboarding", reason: "已核实到岗", status: "completed" }],
    outcome: "hired",
    pipelineStage: "closed",
  } as ResumeLibraryDetail;
  const html = renderToStaticMarkup(<OnboardingStagePanel record={record} />);
  expect(html).toContain("已入职");
  expect(html).toContain("2026-09-08");
  expect(html).toContain("工程师");
  expect(html).toContain("¥ 0");
  expect(html).toContain("已核实到岗");
  expect(html).not.toContain("点击操作栏");
});
