// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installNoopWebAnimations } from "@/test-utils/react-act";
import { ResumeLibraryFloatingActionBar } from "../resume-library-floating-action-bar";

// SAFETY: Vitest's jsdom global supports React's documented act-environment marker.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installNoopWebAnimations();

afterEach(() => {
  document.body.innerHTML = "";
});

function renderBar(selectedCount: number, disabled = false) {
  const element = document.createElement("div");
  element.innerHTML = renderToStaticMarkup(
    <ResumeLibraryFloatingActionBar
      onBulkDelete={() => {}}
      onClearSelection={() => {}}
      selectedCount={selectedCount}
      disabled={disabled}
      disabledReason="所选记录包含解析中的简历，暂不能删除"
    />,
  );
  return element;
}

function findButton(element: ParentNode, label: string) {
  return [...element.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(label),
  );
}

describe("招聘台删除浮动栏", () => {
  it("选中后提供批量删除和取消选择", () => {
    const element = renderBar(2);
    expect(findButton(element, "批量删除")?.dataset.variant).toBe("destructive-subtle");
    expect(findButton(element, "取消选择")).toBeDefined();
    expect(element.textContent).toContain("已选择 2 条");
    expect(element.textContent).not.toContain("推进");
    expect(element.textContent).not.toContain("不通过");
  });

  it("空选择不显示，解析中的记录禁止删除但仍可取消选择", () => {
    expect(renderBar(0).querySelector("button")).toBeNull();
    const locked = renderBar(1, true);
    expect(findButton(locked, "批量删除")?.disabled).toBe(true);
    expect(findButton(locked, "取消选择")?.disabled).toBe(false);
  });

  it("点击取消选择会清空选择", async () => {
    const onClearSelection = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(() => {
      root.render(
        <ResumeLibraryFloatingActionBar
          onBulkDelete={() => {}}
          onClearSelection={onClearSelection}
          selectedCount={2}
        />,
      );
    });

    await act(() => {
      findButton(container, "取消选择")?.click();
    });

    expect(onClearSelection).toHaveBeenCalledTimes(1);
    await act(() => root.unmount());
  });
});
