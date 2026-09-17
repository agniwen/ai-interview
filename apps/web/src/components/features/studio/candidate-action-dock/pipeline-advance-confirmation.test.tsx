// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { enableReactActEnvironment } from "@/test-utils/react-act";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { CandidateActionDock } from "./candidate-action-dock";
import { PipelineStageActionBar } from "../pipeline-stage-action-bar";
import { ScreeningAdvanceActions } from "../screening-advance-actions";

enableReactActEnvironment();
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi
    .fn()
    .mockReturnValue({ addEventListener: vi.fn(), matches: true, removeEventListener: vi.fn() }),
});
async function click(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent === label && !element.closest("[hidden]"),
  );
  expect(button, label).toBeDefined();
  await act(() => button?.click());
}

it.each([
  ["second_interview", "进入终试", "final_interview"],
  ["final_interview", "面试结束，进入 Offer 协商", "income_proof"],
  ["income_proof", "进入谈薪", "salary_negotiation"],
  ["salary_negotiation", "进入发 Offer", "offer"],
  ["offer", "进入背调", "background_check"],
  ["background_check", "进入入职", "onboarding"],
] as const)(
  "%s requires confirmation in the animated dock and retains failures for retry",
  async (stage, label, target) => {
    const advance = vi
      .fn()
      .mockRejectedValueOnce(new Error("状态已更新"))
      .mockImplementation(async () => {});
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(() =>
        root.render(
          <CandidateActionDock candidateName="候选人">
            <PipelineStageActionBar
              pipelineStage={stage}
              currentNodePassed
              onAdvance={advance}
              onRequestClose={vi.fn()}
              onRequestReactivate={vi.fn()}
              onViewCurrentStage={vi.fn()}
            />
          </CandidateActionDock>,
        ),
      );
      await click(label);
      expect(advance).not.toHaveBeenCalled();
      expect(
        document.querySelector<HTMLElement>('[data-slot="candidate-action-dock"]')?.dataset
          .expanded,
      ).toBe("true");
      if (stage === "second_interview") {
        expect(
          document.querySelector('[data-action-flow="advance-pipeline"]')?.textContent,
        ).toContain("复试节点记录为跳过");
      }
      await click("返回操作");
      expect(advance).not.toHaveBeenCalled();
      await click(label);
      await click("取消");
      expect(advance).not.toHaveBeenCalled();
      await click(label);
      await click("确认推进");
      expect(advance).toHaveBeenCalledExactlyOnceWith(target);
      expect(document.querySelector('[role="alert"]')?.textContent).toBe("状态已更新");
      await click("确认推进");
      expect(advance).toHaveBeenCalledTimes(2);
      expect(
        document.querySelector<HTMLElement>('[data-slot="candidate-action-dock"]')?.dataset
          .expanded,
      ).toBe("false");
    } finally {
      await act(() => root.unmount());
      host.remove();
    }
  },
);

it.each([
  ["推进 AI 初面", "ai_interview"],
  ["直接安排复试", "second_interview"],
] as const)("screening %s sends no request until confirmed", async (label, targetNode) => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ success: true }));
  const client = new QueryClient();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <WorkspaceSlugProvider
            id="workspace"
            slug="default"
            memberRole="member"
            permissions={{
              humanInterview: ["create"],
              interview: ["create"],
              resumeLibrary: ["update"],
            }}
          >
            <CandidateActionDock candidateName="候选人">
              <ScreeningAdvanceActions
                record={{
                  id: "record",
                  jobDescriptionId: "job",
                  pipelineStage: "screening",
                  resumeEvaluationStatus: "pass",
                  version: 1,
                }}
              />
            </CandidateActionDock>
          </WorkspaceSlugProvider>
        </QueryClientProvider>,
      ),
    );
    await click(label);
    expect(fetchMock).not.toHaveBeenCalled();
    await click("取消");
    expect(fetchMock).not.toHaveBeenCalled();
    await click(label);
    await click("确认推进");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [[url, init]] = fetchMock.mock.calls;
    expect(String(url)).toContain("/api/w/default/studio/interviews/record/transition");
    expect(JSON.parse(String(init?.body))).toEqual({
      action: "screening_advance",
      expectedVersion: 1,
      targetNode,
    });
  } finally {
    await act(() => root.unmount());
    client.clear();
    host.remove();
    fetchMock.mockRestore();
  }
});
