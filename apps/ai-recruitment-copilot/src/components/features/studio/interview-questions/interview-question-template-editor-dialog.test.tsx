// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InterviewQuestionTemplateEditorDialog } from "./interview-question-template-editor-dialog";

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

function TestResizeObserver() {}

TestResizeObserver.prototype.disconnect = vi.fn();
TestResizeObserver.prototype.observe = vi.fn();
TestResizeObserver.prototype.unobserve = vi.fn();
globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

const roots: ReturnType<typeof createRoot>[] = [];

afterEach(() => {
  for (const root of roots) {
    root.unmount();
  }
  roots.length = 0;
});

describe("InterviewQuestionTemplateEditorDialog", () => {
  it("can open the create dialog without recursively resetting form state", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <InterviewQuestionTemplateEditorDialog
          jobDescriptions={[]}
          onOpenChange={() => {}}
          onSaved={() => {}}
          open
          record={null}
          slug="default"
        />,
      );
    });

    expect(document.body.textContent).toContain("新建面试题");
  });

  it("shows a visible validation message when all questions are removed", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <InterviewQuestionTemplateEditorDialog
          jobDescriptions={[]}
          onOpenChange={() => {}}
          onSaved={() => {}}
          open
          record={null}
          slug="default"
        />,
      );
    });

    const deleteButton = document.querySelector<HTMLButtonElement>('[aria-label="删除第 1 题"]');
    expect(deleteButton).toBeTruthy();
    act(() => {
      deleteButton?.click();
    });

    const submitButton = document.querySelector<HTMLButtonElement>(
      'button[form="interview-question-template-form"]',
    );
    expect(submitButton).toBeTruthy();
    await act(async () => {
      submitButton?.click();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("请至少保留一道题目");
  });
});
