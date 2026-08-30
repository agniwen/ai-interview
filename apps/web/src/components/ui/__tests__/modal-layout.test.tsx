// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertDialogFooter } from "../alert-dialog";
import { Button } from "../button";
import { DialogFooter } from "../dialog";
import { Modal } from "../modal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// SAFETY: The jsdom fixture provides the media-query API consumed by use-mobile.
window.matchMedia = ((query: string) => ({
  addEventListener: () => {},
  addListener: () => {},
  dispatchEvent: () => false,
  matches: false,
  media: query,
  onchange: null,
  removeEventListener: () => {},
  removeListener: () => {},
})) as typeof window.matchMedia;

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

describe("modal layout", () => {
  it("uses the default button size across shared modal footers", async () => {
    const root = await renderAndFlush(
      <>
        <DialogFooter>
          <Button>Dialog 操作</Button>
        </DialogFooter>
        <AlertDialogFooter>
          <Button>Alert Dialog 操作</Button>
        </AlertDialogFooter>
        <Modal footer={<Button>Modal 操作</Button>} onOpenChange={vi.fn()} open title="弹窗标题">
          弹窗内容
        </Modal>
      </>,
    );

    for (const label of ["Dialog 操作", "Alert Dialog 操作", "Modal 操作"]) {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent === label,
      );
      expect(button?.dataset.size).toBe("default");
    }

    act(() => root.unmount());
  });

  it("uses compact radius and spacing on desktop", async () => {
    const root = await renderAndFlush(
      <Modal footer={<Button>保存</Button>} onOpenChange={vi.fn()} open title="弹窗标题">
        弹窗内容
      </Modal>,
    );
    const body = document.querySelector<HTMLElement>('[data-slot="modal-body"]');
    const frame = body?.parentElement;
    const header = frame?.firstElementChild;
    const footer = body?.nextElementSibling;

    expect(frame?.classList.contains("rounded-lg")).toBe(true);
    expect(frame?.classList.contains("rounded-3xl")).toBe(false);
    expect(header?.classList.contains("px-5")).toBe(true);
    expect(header?.classList.contains("pt-4")).toBe(true);
    expect(header?.classList.contains("pb-3")).toBe(true);
    expect(body?.classList.contains("px-5")).toBe(true);
    expect(body?.classList.contains("py-4")).toBe(true);
    expect(footer?.classList.contains("px-5")).toBe(true);
    expect(footer?.classList.contains("py-3")).toBe(true);

    act(() => root.unmount());
  });
});
