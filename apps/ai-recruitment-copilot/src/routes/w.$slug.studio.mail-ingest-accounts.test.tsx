// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderMessageBadge } from "./w.$slug.studio.mail-ingest-accounts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function renderNode(node: ReturnType<typeof renderMessageBadge>) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { container, root };
}

describe("renderMessageBadge", () => {
  it("renders a non-clickable dash for a row without an account", () => {
    const onSelect = vi.fn();
    const { container, root } = renderNode(
      renderMessageBadge({ account: null, messageCount: 0, problemCount: 0 }, onSelect),
    );

    expect(container.textContent).toBe("—");
    expect(container.querySelector("button")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders a keyboard-accessible button for a row with an account, calling onSelect with the account id on click", () => {
    const onSelect = vi.fn();
    const { container, root } = renderNode(
      renderMessageBadge(
        {
          account: { emailAddress: "hr@example.com", id: "acc-1" },
          messageCount: 3,
          problemCount: 0,
        },
        onSelect,
      ),
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("type")).toBe("button");
    expect(button?.className).toContain("focus-visible:outline-2");
    expect(button?.getAttribute("aria-label")).toBe("查看 hr@example.com 的入库记录");
    expect(button?.textContent).toBe("3");

    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("acc-1");

    act(() => {
      root.unmount();
    });
  });

  it("shows the red problem count when problemCount > 0", () => {
    const { container, root } = renderNode(
      renderMessageBadge(
        {
          account: { emailAddress: "hr@example.com", id: "acc-1" },
          messageCount: 5,
          problemCount: 2,
        },
        vi.fn(),
      ),
    );

    expect(container.textContent).toBe("5·2");
    expect(container.querySelector(".text-destructive")?.textContent).toBe("·2");

    act(() => {
      root.unmount();
    });
  });
});
