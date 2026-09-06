// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { recruitingBoardGroups } from "@app/shared/recruiting-board";
import { ResumeLibraryPageEmptyState } from "../resume-library-page-empty-state";

function emptyText(stageFilter: string) {
  const html = renderToStaticMarkup(
    <ResumeLibraryPageEmptyState
      canUploadResumeLibrary={false}
      onOpenUploadEntry={() => {}}
      stageFilter={stageFilter}
      uploadEntryDisabled={false}
    />,
  );
  const element = document.createElement("div");
  element.innerHTML = html;
  return element.textContent;
}

describe("招聘台空状态的阶段名称", () => {
  for (const group of recruitingBoardGroups) {
    for (const tab of group.tabs) {
      it(`${tab.value} 使用与标签一致的中文名称`, () => {
        const text = emptyText(tab.value);
        if (group.id !== "all") {
          expect(text).toContain(group.label);
        }
        if (!tab.value.endsWith(":all")) {
          expect(text).toContain(tab.label);
        }
        expect(text).not.toContain(tab.value);
      });
    }
  }
  it("终试旧链接仍显示终试", () => {
    expect(emptyText("final_interview")).toContain("终试");
  });
  it.each(["", "unknown:value"])("默认或无效选择 %s 不误报全库为空", (value) => {
    expect(emptyText(value)).toContain("全部");
    expect(emptyText(value)).not.toContain("还没有任何候选人");
    expect(emptyText(value)).not.toContain("unknown:value");
  });
});
