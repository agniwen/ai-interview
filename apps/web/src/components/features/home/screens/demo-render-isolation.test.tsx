// @vitest-environment jsdom
import { act, memo, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DemoProvider, useDemo, useDemoReset } from "./demo-context";

// SAFETY: React's test-only act flag belongs to the global test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Stage() {
  const demo = useDemo();
  return (
    <button type="button" onClick={() => demo.setStage("offer:negotiating")}>
      {demo.stage}
    </button>
  );
}
it("keeps outer content and stable playback controls from rendering on demo state changes", () => {
  const outerCommit = vi.fn();
  const controlsCommit = vi.fn();
  const Controls = memo(function Controls() {
    const reset = useDemoReset();
    useEffect(() => {
      controlsCommit();
    });
    return (
      <button type="button" onClick={reset}>
        重播
      </button>
    );
  });
  function Page() {
    useEffect(() => {
      outerCommit();
    });
    return (
      <>
        <h1>首页</h1>
        <DemoProvider>
          <Controls />
          <Stage />
        </DemoProvider>
      </>
    );
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() => root.render(<Page />));
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    act(() => buttons[1].click());
    expect(buttons[1].textContent).toBe("offer:negotiating");
    act(() => buttons[0].click());
    expect(buttons[1].textContent).toBe("all");
    expect(outerCommit).toHaveBeenCalledTimes(1);
    expect(controlsCommit).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
