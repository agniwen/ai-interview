// @vitest-environment jsdom

import { act, createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { StudioSidePaneFrame } from "../studio-side-pane";
import {
  StudioSidePaneContent,
  StudioSidePaneTarget,
  STUDIO_SIDE_PANE_TITLE_ID,
  StudioSidePaneProvider,
  useStudioSidePane,
  useStudioSidePaneController,
} from "../studio-side-pane-context";
import { installNoopResizeObserver, installNoopWebAnimations } from "@/test-utils/react-act";

// SAFETY: This flag explicitly enables React's test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installNoopResizeObserver();
installNoopWebAnimations();

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function PaneHarness() {
  const { isOpen, open, close } = useStudioSidePane("upload-tasks");
  const [count, setCount] = useState(0);
  return (
    <>
      <button onClick={() => setCount(count + 1)} type="button">
        主内容 {count}
      </button>
      <button
        aria-label="切换上传任务"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : open())}
        type="button"
      >
        切换
      </button>
      {isOpen ? (
        <StudioSidePaneFrame desktop onClose={() => close()}>
          <StudioSidePaneTarget />
        </StudioSidePaneFrame>
      ) : null}
      <StudioSidePaneContent id="upload-tasks">
        <h2 id={STUDIO_SIDE_PANE_TITLE_ID}>上传任务</h2>
        <button onClick={() => close()} type="button">
          关闭
        </button>
        {createPortal(
          <button type="button" data-preview>
            预览弹窗
          </button>,
          document.body,
        )}
      </StudioSidePaneContent>
    </>
  );
}

it("keeps the main content interactive and mounted while toggling the pane; Escape in a preview does not close it", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <StudioSidePaneProvider scopeKey="test">
        <PaneHarness />
      </StudioSidePaneProvider>,
    ),
  );
  const toggle = host.querySelector<HTMLButtonElement>('[aria-label="切换上传任务"]');
  const main = host.querySelector<HTMLButtonElement>("button");
  act(() => toggle?.click());
  const pane = host.querySelector("aside");
  expect(pane).not.toBeNull();
  expect(document.activeElement).toBe(pane);
  act(() => main?.click());
  expect(main?.textContent).toBe("主内容 1");
  expect(host.querySelector("aside")).toBe(pane);
  act(() =>
    document
      .querySelector("[data-preview]")
      ?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })),
  );
  expect(host.querySelector("aside")).toBe(pane);
  act(() => pane?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })));
  expect(host.querySelector("aside")).toBeNull();
  expect(main?.textContent).toBe("主内容 1");
  act(() => toggle?.click());
  expect(toggle?.getAttribute("aria-expanded")).toBe("true");
  act(() => toggle?.click());
  expect(host.querySelector("aside")).toBeNull();
  act(() => root.unmount());
});

it("uses an accessible dialog on narrow screens", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const close = vi.fn();
  await act(async () => {
    root.render(
      <StudioSidePaneFrame desktop={false} onClose={close}>
        <h2 id={STUDIO_SIDE_PANE_TITLE_ID}>上传任务</h2>
        <button type="button">任务</button>
      </StudioSidePaneFrame>,
    );
    await Promise.resolve();
  });
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog).not.toBeNull();
  const titleId = dialog?.getAttribute("aria-labelledby");
  expect(titleId && document.querySelector(`[id="${titleId}"]`)?.textContent).toBe("上传任务");
  act(() => root.unmount());
});

const SourceContext = createContext("outside");
function SourceValue() {
  return <p>{useContext(SourceContext)}</p>;
}
function Owner({ id }: { id: string }) {
  const pane = useStudioSidePane(id);
  return (
    <SourceContext.Provider value={`context-${id}`}>
      <button type="button" {...pane.triggerProps}>
        {id}
      </button>
      <StudioSidePaneContent id={id}>
        <SourceValue />
      </StudioSidePaneContent>
    </SourceContext.Provider>
  );
}

it("preserves source context, replaces owners, and resets on workspace changes", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (scopeKey: string, first = true) =>
    act(() =>
      root.render(
        <StudioSidePaneProvider scopeKey={scopeKey}>
          {first && <Owner id="first" />}
          <Owner id="second" />
          <StudioSidePaneTarget data-target />
        </StudioSidePaneProvider>,
      ),
    );
  const click = (label: string) =>
    act(() =>
      [...host.querySelectorAll("button")].find((button) => button.textContent === label)?.click(),
    );
  const content = () => host.querySelector("[data-target]")?.textContent;
  render("one");
  expect(content()).toBe("");
  click("first");
  expect(content()).toBe("context-first");
  click("second");
  expect(content()).toBe("context-second");
  render("one", false);
  expect(content()).toBe("context-second");
  render("two", false);
  expect(content()).toBe("");
  render("one", false);
  expect(content()).toBe("");
  click("second");
  expect(content()).toBe("context-second");
  act(() => root.unmount());
});

it("retains mobile content until exit completes and ignores stale completion after reopening", () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width") }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let controller: ReturnType<typeof useStudioSidePaneController> | undefined;
  function Controls() {
    controller = useStudioSidePaneController();
    return (
      <>
        <Owner id="first" />
        <StudioSidePaneTarget data-target />
      </>
    );
  }
  act(() =>
    root.render(
      <StudioSidePaneProvider scopeKey="test">
        <Controls />
      </StudioSidePaneProvider>,
    ),
  );
  act(() => controller?.open("first"));
  act(() => controller?.close());
  expect(controller?.isClosing).toBe(true);
  expect(host.querySelector("[data-target]")?.textContent).toBe("context-first");
  const staleFinish = controller?.finishClosing;
  act(() => controller?.open("first"));
  act(() => controller?.close());
  act(() => staleFinish?.());
  expect(controller?.activeId).toBe("first");
  act(() => controller?.finishClosing());
  expect(controller?.activeId).toBeNull();
  expect(host.querySelector("[data-target]")?.textContent).toBe("");
  act(() => root.unmount());
});
