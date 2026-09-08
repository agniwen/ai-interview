// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import { enableReactActEnvironment, waitForUi } from "@/test-utils/react-act";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { RecruitingNodeActions } from "./recruiting-node-actions";

enableReactActEnvironment();
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi
    .fn()
    .mockReturnValue({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }),
});

describe("node confirmation dialog lifetime", () => {
  it("keeps the open dialog mounted when refreshed node data completes, then releases interaction on close", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onAdvance = vi.fn();
    const render = (completed: boolean) =>
      root.render(
        <QueryClientProvider client={client}>
          <WorkspaceSlugProvider id="test" slug="test" memberRole="owner" permissions={{}}>
            <RecruitingNodeActions
              record={
                // SAFETY: 此交互只读取身份、版本、当前节点和节点状态，已提供全部被读字段。
                {
                  id: "record",
                  nodeStates: [
                    {
                      node: "background_check",
                      result: completed ? "pass" : null,
                      status: completed ? "completed" : "pending",
                    },
                  ],
                  pipelineStage: "background_check",
                  version: completed ? 2 : 1,
                } as ResumeLibraryDetail
              }
            />
            <button type="button" onClick={onAdvance}>
              进入入职
            </button>
          </WorkspaceSlugProvider>
        </QueryClientProvider>,
      );
    await act(() => render(false));
    await act(() => host.querySelector<HTMLButtonElement>("button")?.click());
    await waitForUi(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    const popup = document.querySelector('[role="dialog"]');
    await act(() => render(true));
    expect(document.querySelector('[role="dialog"]')).toBe(popup);
    const close = document.querySelector<HTMLButtonElement>('[data-slot="modal-close"]');
    expect(close).not.toBeNull();
    await act(() => close?.click());
    await waitForUi(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    await act(() =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "进入入职")
        ?.click(),
    );
    expect(onAdvance).toHaveBeenCalledOnce();
    await act(() => root.unmount());
    client.clear();
    host.remove();
  });
});

it.each(["income_proof", "background_check", "onboarding"] as const)(
  "%s 直接确认结果，不手动选择进度",
  async (stage) => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const client = new QueryClient();
    try {
      await act(() =>
        root.render(
          <QueryClientProvider client={client}>
            <WorkspaceSlugProvider id="test" slug="test" memberRole="owner" permissions={{}}>
              <RecruitingNodeActions
                record={
                  // SAFETY: 只读取此处提供的节点、身份与版本字段。
                  {
                    candidateExpectationsMeta: { earliestJoiningDate: "2026-09-18" },
                    id: "record",
                    nodeStates: [{ node: stage, reason: "已完成核实", status: "pending" }],
                    pipelineStage: stage,
                    version: 3,
                  } as ResumeLibraryDetail
                }
              />
            </WorkspaceSlugProvider>
          </QueryClientProvider>,
        ),
      );
      await act(() => host.querySelector<HTMLButtonElement>("button")?.click());
      await waitForUi(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) {
        throw new Error("确认弹窗未打开");
      }
      if (stage === "onboarding") {
        expect(dialog.querySelector('[aria-label="最早可入职日"]')).not.toBeNull();
      } else {
        expect(dialog.querySelector('[role="combobox"]')).toBeNull();
      }
      expect(dialog.textContent).not.toContain("保存进度");
      const confirm = [...dialog.querySelectorAll("button")].find(
        (button) => button.textContent === (stage === "onboarding" ? "确认入职" : "通过"),
      );
      expect(confirm).toBeDefined();
      await act(() => confirm?.click());
      await waitForUi(() => expect(request).toHaveBeenCalledOnce());
      const [[, init]] = request.mock.calls;
      if (stage === "onboarding") {
        expect(await new Response(init?.body).json()).toMatchObject({
          earliestJoiningDate: "2026-09-18",
        });
      }
      expect(await new Response(init?.body).json()).toMatchObject({
        action: "update_node",
        expectedVersion: 3,
        node: stage,
        reason: "已完成核实",
        result: "pass",
        targetStatus: "completed",
      });
      await waitForUi(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    } finally {
      request.mockRestore();
      await act(() => root.unmount());
      client.clear();
      host.remove();
    }
  },
);
