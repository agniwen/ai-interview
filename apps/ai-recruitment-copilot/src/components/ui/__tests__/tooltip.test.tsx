// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Tooltip", () => {
  it("positions the arrow against the rendered side without a separate stacking layer", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Tooltip open>
          <TooltipTrigger>触发提示</TooltipTrigger>
          <TooltipContent>提示内容</TooltipContent>
        </Tooltip>,
      );
      await Promise.resolve();
    });

    const arrow = document.querySelector('[data-side="top"][aria-hidden="true"]');

    expect(arrow).toBeTruthy();
    expect(arrow?.className).toContain("data-[side=top]:bottom-[-5px]");
    expect(arrow?.className).toContain("data-[side=bottom]:top-[-5px]");
    expect(arrow?.className).toContain("data-[side=left]:right-[-5px]");
    expect(arrow?.className).toContain("data-[side=right]:left-[-5px]");
    expect(arrow?.className).not.toContain("translate-y");
    expect(arrow?.className).not.toContain("z-50");

    act(() => root.unmount());
  });
});
