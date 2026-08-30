// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JobDescriptionUpgradeDialogLayout } from "./job-description-upgrade-dialog";

describe("JobDescriptionUpgradeDialog layout", () => {
  it("places scoring rules beside the new JD and keeps structured settings below", () => {
    const markup = renderToStaticMarkup(
      <JobDescriptionUpgradeDialogLayout
        jobDescription={
          <>
            <div>
              <h2>新版岗位 JD</h2>
              <p>岗位描述</p>
            </div>
            <textarea aria-label="新版岗位 JD" />
          </>
        }
        scoringRules={
          <>
            <div>
              <h2>新版评分规则</h2>
              <button type="button">生成评分规则</button>
            </div>
            <div>评分规则预览</div>
          </>
        }
        structuredFields={<div data-testid="structured-fields">结构化设置</div>}
      />,
    );
    const container = document.createElement("div");
    container.innerHTML = markup;

    const jdHeading = [...container.querySelectorAll("h2")].find(
      (heading) => heading.textContent === "新版岗位 JD",
    );
    const rulesHeading = [...container.querySelectorAll("h2")].find(
      (heading) => heading.textContent === "新版评分规则",
    );
    if (!(jdHeading && rulesHeading)) {
      throw new Error("expected both upgrade editor headings");
    }

    const jdSection = jdHeading.parentElement?.parentElement;
    const rulesSection = rulesHeading.parentElement?.parentElement;
    expect(jdSection?.parentElement).toBe(rulesSection?.parentElement);
    expect(jdSection?.parentElement?.className).toContain("xl:grid-cols-2");

    const generateButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("生成评分规则"),
    );
    expect(rulesSection?.contains(generateButton ?? null)).toBe(true);

    const structuredFields = container.querySelector('[data-testid="structured-fields"]');
    expect(jdSection?.parentElement?.contains(structuredFields)).toBe(false);
    if (!structuredFields) {
      throw new Error("expected structured settings below the two-column editor");
    }
    expect(jdSection?.parentElement?.compareDocumentPosition(structuredFields)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
