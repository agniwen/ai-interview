// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  enableReactActEnvironment,
  installNoopResizeObserver,
  renderInAct,
  unmountInAct,
  waitForUi,
} from "@/test-utils/react-act";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { CandidateFormTemplateEditorDialog } from "../form-template-editor-dialog";

enableReactActEnvironment();
installNoopResizeObserver();

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
});

describe("CandidateFormTemplateEditorDialog", () => {
  it("can open the create dialog without recursively resetting form state", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ addEventListener: () => {}, matches: false, removeEventListener: () => {} }),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { root } = await renderInAct(
      <QueryClientProvider client={queryClient}>
        <WorkspaceSlugProvider id="org-default" memberRole="admin" permissions={{}} slug="default">
          <CandidateFormTemplateEditorDialog
            initialDraft={{
              description: "",
              jobDescriptionIds: [],
              questions: [0, 1].map((index) => ({
                displayMode: "textarea",
                id: crypto.randomUUID(),
                label: `问题 ${index + 1}`,
                options: [],
                required: true,
                sortOrder: index,
                type: "text",
              })),
              scope: "global",
              title: "测试表单",
            }}
            jobDescriptions={[]}
            onOpenChange={() => {}}
            onSaved={() => {}}
            open
            record={null}
          />
        </WorkspaceSlugProvider>
      </QueryClientProvider>,
    );
    roots.push(root);

    expect(document.body.textContent).toContain("创建表单题");
    await waitForUi(() =>
      expect(document.querySelectorAll('[aria-label^="配置第"]')).toHaveLength(2),
    );
    act(() => document.querySelector<HTMLElement>('[aria-label="配置第 1 题"]')?.click());
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="删除题目"]')?.click());
    const confirmDelete = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "确认删除",
    );
    expect(confirmDelete).toBeDefined();
    act(() => confirmDelete?.click());
    await waitForUi(() => {
      expect(document.querySelectorAll('[aria-label^="配置第"]')).toHaveLength(1);
      expect(document.body.textContent).toContain("编辑题干、展示方式和选项。");
    });
  });
});
