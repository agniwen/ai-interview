// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Switch } from "../switch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Switch motion", () => {
  it("does not bounce on mount and enables the recipe on first interaction", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Switch aria-label="测试开关" defaultChecked={false} />);
    });

    const switchElement = document.querySelector<HTMLButtonElement>('[role="switch"]');
    expect(switchElement).not.toBeNull();
    expect(switchElement?.getAttribute("data-motion-ready")).toBeNull();

    await act(async () => {
      switchElement?.click();
    });

    expect(switchElement?.getAttribute("data-motion-ready")).toBe("");
    expect(switchElement?.hasAttribute("data-checked")).toBe(true);

    act(() => root.unmount());
  });
});
