// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "../dialog";
import { Modal } from "../modal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

async function renderAndFlush(element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(element);
    await Promise.resolve();
  });

  return root;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("dialog initial focus", () => {
  it("does not focus the Modal close button when opened", async () => {
    const root = await renderAndFlush(
      <Modal onOpenChange={vi.fn()} open title="候选人姓名">
        <button type="button">主要操作</button>
      </Modal>,
    );
    const closeButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("关闭"),
    );

    expect(closeButton).toBeTruthy();
    expect(document.activeElement).not.toBe(closeButton);

    act(() => root.unmount());
  });

  it("does not focus the DialogContent close button when opened", async () => {
    const root = await renderAndFlush(
      <Dialog onOpenChange={vi.fn()} open>
        <DialogContent>
          <DialogTitle>弹窗标题</DialogTitle>
          <button type="button">主要操作</button>
        </DialogContent>
      </Dialog>,
    );
    const closeButton = document.querySelector('[data-slot="dialog-close"]');

    expect(closeButton).toBeTruthy();
    expect(document.activeElement).not.toBe(closeButton);

    act(() => root.unmount());
  });
});
