// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecommendedQuestionsDialog } from "./recommended-questions-dialog";

// SAFETY: React reads this documented test-environment flag from globalThis.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
  })),
});

function getButton(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === label,
  );
}

describe("RecommendedQuestionsDialog", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
  });

  it("opens read-only and enters editing only after the edit button is clicked", async () => {
    await act(async () => {
      root.render(
        <RecommendedQuestionsDialog
          canEdit
          onOpenChange={vi.fn()}
          onSave={vi.fn()}
          open
          questions={[
            {
              difficulty: "medium",
              dimension: "business",
              evaluationFocus: "架构判断",
              followUpDirections: "追问方案取舍",
              order: 1,
              question: "请介绍一次系统设计经历。",
            },
          ]}
        />,
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("请介绍一次系统设计经历。");
    expect(document.querySelector("textarea")).toBeNull();
    expect(getButton("编辑")).toBeDefined();

    await act(async () => {
      getButton("编辑")?.click();
      await Promise.resolve();
    });

    expect(document.querySelector("textarea")).not.toBeNull();
    expect(document.querySelector('[aria-label="第 1 题维度"]')).not.toBeNull();
    expect(getButton("保存问题")).toBeDefined();

    await act(async () => {
      getButton("取消")?.click();
      await Promise.resolve();
    });

    expect(document.querySelector("textarea")).toBeNull();
    expect(getButton("编辑")).toBeDefined();
  });
});
