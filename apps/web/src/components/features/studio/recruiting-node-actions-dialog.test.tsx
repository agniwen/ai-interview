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

function expectedConfirmLabel(
  stage: "background_check" | "income_proof" | "onboarding" | "salary_negotiation",
) {
  if (stage === "onboarding") {
    return "确认入职";
  }
  if (stage === "income_proof") {
    return "通过并进入谈薪";
  }
  return stage === "salary_negotiation" ? "确认并进入发 Offer" : "通过";
}

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

it.each(["income_proof", "salary_negotiation", "background_check", "onboarding"] as const)(
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
        expect(dialog.textContent).not.toContain("最早可入职日");
        const datePicker = dialog.querySelector<HTMLButtonElement>('[aria-label="到岗日期"]');
        expect(datePicker).not.toBeNull();
        expect(
          [...dialog.querySelectorAll("button")]
            .find((button) => button.textContent === "确认入职")
            ?.getAttribute("aria-disabled"),
        ).toBe("true");
        await act(() => datePicker?.click());
        await waitForUi(() => expect(document.querySelector("button[data-day]")).not.toBeNull());
        const day = [...document.querySelectorAll<HTMLButtonElement>("button[data-day]")].find(
          (button) => !button.disabled && new Date(button.dataset.day ?? "").getDate() === 10,
        );
        expect(day).toBeDefined();
        await act(() => day?.click());
        await act(() =>
          [...document.querySelectorAll("button")]
            .find((button) => button.textContent === "确定")
            ?.click(),
        );
      } else {
        expect(dialog.querySelector('[role="combobox"]')).toBeNull();
      }
      if (stage === "income_proof") {
        expect(dialog.textContent).toContain("确认流水审核结果");
        expect(dialog.textContent).toContain("未提供材料时，请在说明中记录原因");
      }
      if (stage === "salary_negotiation") {
        const salary = dialog.querySelector<HTMLInputElement>('[aria-label="谈定 Base 月薪"]');
        expect(salary).not.toBeNull();
        expect(
          [...dialog.querySelectorAll("button")]
            .find((button) => button.textContent === "确认并进入发 Offer")
            ?.getAttribute("aria-disabled"),
        ).toBe("true");
        await act(() => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
            salary,
            "28000",
          );
          salary?.dispatchEvent(new Event("input", { bubbles: true }));
        });
      }
      expect(dialog.textContent).not.toContain("保存进度");
      const confirm = [...dialog.querySelectorAll("button")].find(
        (button) => button.textContent === expectedConfirmLabel(stage),
      );
      expect(confirm).toBeDefined();
      await act(() => confirm?.click());
      await waitForUi(() => expect(request).toHaveBeenCalledOnce());
      const [[, init]] = request.mock.calls;
      if (stage === "onboarding") {
        expect(await new Response(init?.body).json()).toMatchObject({
          actualJoiningDate: expect.stringMatching(/-10$/),
        });
      }
      const payload = await new Response(init?.body).json();
      if (stage === "income_proof") {
        expect(payload).toMatchObject({
          action: "review_income_proof",
          expectedVersion: 3,
          reason: "已完成核实",
          result: "pass",
        });
      } else if (stage === "salary_negotiation") {
        expect(payload).toMatchObject({
          action: "review_salary_negotiation",
          agreedBaseSalary: 28_000,
          expectedVersion: 3,
          reason: "已完成核实",
          result: "pass",
        });
      } else {
        expect(payload).toMatchObject({
          action: "update_node",
          expectedVersion: 3,
          node: stage,
          reason: "已完成核实",
          result: "pass",
          targetStatus: "completed",
        });
      }
      await waitForUi(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    } finally {
      request.mockRestore();
      await act(() => root.unmount());
      client.clear();
      host.remove();
    }
  },
);
