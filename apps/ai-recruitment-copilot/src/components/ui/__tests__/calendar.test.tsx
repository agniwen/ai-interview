// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Calendar } from "../calendar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Calendar", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps the selected day primary-colored while hovered", () => {
    const selected = new Date(2026, 6, 24);

    act(() => {
      root.render(<Calendar mode="single" selected={selected} />);
    });

    const selectedDay = container.querySelector<HTMLButtonElement>(
      'button[data-selected-single="true"]',
    );
    expect(selectedDay).not.toBeNull();
    expect(selectedDay?.className).toContain("data-[selected-single=true]:hover:bg-primary");
    expect(selectedDay?.className).toContain(
      "data-[selected-single=true]:hover:text-primary-foreground",
    );
  });
});
