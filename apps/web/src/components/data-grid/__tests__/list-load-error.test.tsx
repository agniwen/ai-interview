// @vitest-environment jsdom

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListLoadError } from "@/components/data-grid/list-load-error";

// SAFETY: The test fixture is constructed with the asserted shape before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ListLoadError", () => {
  it("shows the request error and retries on demand", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onRetry = vi.fn();

    act(() => {
      root.render(<ListLoadError error={new Error("服务暂不可用")} onRetry={onRetry} />);
    });

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain("服务暂不可用");

    const button = container.querySelector("button");
    expect(button?.textContent).toBe("重试");
    act(() => button?.click());
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("supports a compact stale-data warning", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(<ListLoadError compact error={new Error("刷新失败")} />);
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.className).not.toContain("min-h-48");
    expect(container.textContent).toContain("刷新失败");
  });
});
