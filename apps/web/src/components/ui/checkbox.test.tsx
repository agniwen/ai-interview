// @vitest-environment jsdom

import { act, Profiler, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Checkbox } from "@/components/ui/checkbox";
import { installNoopWebAnimations } from "@/test-utils/react-act";

// SAFETY: Vitest's jsdom global supports React's documented act-environment marker.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installNoopWebAnimations();

const CHECKBOX_COUNT = 100;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Checkbox bulk updates", () => {
  it("does not schedule one exit commit per unchecked indicator", async () => {
    const onRender = vi.fn();

    function Harness() {
      const [checked, setChecked] = useState(true);
      return (
        <>
          <button onClick={() => setChecked(false)} type="button">
            Clear
          </button>
          {Array.from({ length: CHECKBOX_COUNT }, (_, index) => (
            <Checkbox aria-label={`Row ${index + 1}`} checked={checked} key={index} />
          ))}
        </>
      );
    }

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () =>
      root.render(
        <Profiler id="checkboxes" onRender={onRender}>
          <Harness />
        </Profiler>,
      ),
    );
    onRender.mockClear();

    const clearButton = container.querySelector("button");
    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onRender.mock.calls.length).toBeLessThanOrEqual(3);
    expect(container.querySelectorAll('[data-slot="checkbox-indicator"]')).toHaveLength(
      CHECKBOX_COUNT,
    );

    await act(async () => root.unmount());
  });
});
