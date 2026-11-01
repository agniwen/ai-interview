// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { enableReactActEnvironment, waitForUi } from "@/test-utils/react-act";
import { CandidateActionDock, useCandidateActionFlow } from "./candidate-action-dock";
import { ScheduleRoundDialogView } from "../human-interview-stage-dialogs";

enableReactActEnvironment();
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi
    .fn()
    .mockReturnValue({ addEventListener: vi.fn(), matches: true, removeEventListener: vi.fn() }),
});
function ScheduleFlow() {
  const flow = useCandidateActionFlow("schedule-interview");
  return (
    <>
      <button onClick={() => flow.setOpen(true)}>安排面试</button>
      <ScheduleRoundDialogView
        dependencies={{ slug: "test" }}
        candidateId="candidate"
        candidateName="候选人"
        passedRoundCount={0}
        onScheduled={vi.fn()}
        onOpenChange={flow.setOpen}
        open={flow.open}
      />
    </>
  );
}
const click = async (text: string) => {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (el) => el.textContent === text && !el.closest("[hidden]"),
  );
  expect(button, text).toBeDefined();
  await act(() => button?.click());
};

it("preserves schedule fields across next, back and suspended flow, then resets on discard", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ pipelineStage: "second_interview", version: 1 }));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["workspace-members", "test"], {
    feishuHumanInterviewEnabled: false,
    records: [],
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <CandidateActionDock candidateName="候选人">
            <ScheduleFlow />
          </CandidateActionDock>
        </QueryClientProvider>,
      ),
    );
    await click("安排面试");
    const date = document.querySelector<HTMLButtonElement>("#scheduled-at");
    await act(() => date?.click());
    await click("确定");
    await waitForUi(() =>
      expect(document.querySelector('[data-slot="popover-content"]')).toBeNull(),
    );
    const selectedDate = date?.textContent;
    expect(selectedDate).not.toContain("选择日期和时间");
    await click("下一步");
    expect(date?.closest("[hidden]")).not.toBeNull();
    await click("上一步");
    expect(date?.closest("[hidden]")).toBeNull();
    expect(date?.textContent).toBe(selectedDate);
    await click("返回操作");
    await click("安排面试");
    expect(document.querySelector("#scheduled-at")?.textContent).toBe(selectedDate);
    await click("取消");
    await click("安排面试");
    expect(document.querySelector("#scheduled-at")?.textContent).toContain("选择日期和时间");
  } finally {
    await act(() => root.unmount());
    client.clear();
    host.remove();
    fetchMock.mockRestore();
  }
});
