// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumeLibraryFloatingActionBar } from "../resume-library-floating-action-bar";

function renderBar(selectedCount: number, disabled = false) {
  const element = document.createElement("div");
  element.innerHTML = renderToStaticMarkup(
    <ResumeLibraryFloatingActionBar
      onBulkDelete={() => {}}
      selectedCount={selectedCount}
      disabled={disabled}
      disabledReason="所选记录包含解析中的简历，暂不能删除"
    />,
  );
  return element;
}
describe("招聘台删除浮动栏", () => {
  it("选中后仅有删除操作", () => {
    const element = renderBar(2);
    const buttons = [...element.querySelectorAll("button")];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toContain("批量删除");
    expect(buttons[0]?.dataset.variant).toBe("destructive");
    expect(element.textContent).toContain("已选择 2 条");
    expect(element.textContent).not.toContain("推进");
    expect(element.textContent).not.toContain("不通过");
  });
  it("空选择不显示，解析中的记录禁止删除", () => {
    expect(renderBar(0).querySelector("button")).toBeNull();
    expect(renderBar(1, true).querySelector("button")?.disabled).toBe(true);
  });
});
