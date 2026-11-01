// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useTableViewportHeight } from "../use-table-viewport-height";

// SAFETY: React test environment flag is explicitly initialized here.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Table({ enabled }: { enabled: boolean }) {
  const ref = useTableViewportHeight(enabled);
  return <div ref={ref} data-testid="table" />;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it("fits the scroll parent, remeasures toolbar changes and releases sizing on mobile", () => {
  let resize: () => void = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- ResizeObserver uses a callback API.
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    },
  );
  vi.stubGlobal("innerWidth", 1280);
  const scroller = document.createElement("div");
  scroller.style.overflowY = "auto";
  scroller.style.paddingBottom = "24px";
  Object.defineProperty(scroller, "clientHeight", { value: 800 });
  const host = document.createElement("div");
  scroller.append(host);
  document.body.append(scroller);
  let tableTop = 250;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function measure(this: HTMLElement) {
      return new DOMRect(0, this === scroller ? 50 : tableTop, 800, 500);
    },
  );
  const root = createRoot(host);
  act(() => root.render(<Table enabled />));
  const table = host.querySelector<HTMLElement>('[data-testid="table"]');
  if (!table) {
    throw new Error("Table did not mount");
  }
  const height = () =>
    Number.parseFloat(table.style.getPropertyValue("--data-grid-auto-max-height"));
  expect(height()).toBe(526);
  tableTop = 300;
  act(() => resize());
  expect(height()).toBe(476);
  scroller.scrollTop = 100;
  tableTop = 200;
  act(() => resize());
  expect(height()).toBe(476);
  vi.stubGlobal("innerWidth", 600);
  act(() => window.dispatchEvent(new Event("resize")));
  expect(table.style.getPropertyValue("--data-grid-auto-max-height")).toBe("");
  vi.stubGlobal("innerWidth", 1280);
  act(() => window.dispatchEvent(new Event("resize")));
  expect(height()).toBe(476);
  act(() => root.render(<Table enabled={false} />));
  expect(disconnect).toHaveBeenCalled();
  expect(table.style.getPropertyValue("--data-grid-auto-max-height")).toBe("");
  act(() => root.unmount());
});
