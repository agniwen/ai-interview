import { describe, expect, it } from "vitest";
import { formatJobDescriptionForDisplay } from "./job-description-display";

describe("job description display", () => {
  it("preserves existing Markdown and newlines", () => {
    const text = "## 岗位职责\n- 熟悉 Python AI 服务\n\n## 任职要求\n- 三年经验";
    expect(formatJobDescriptionForDisplay(text)).toBe(text);
  });
  it("separates existing headings in single-line text without changing the wording", () => {
    const text =
      "岗位职责 架构落地：设计 Python AI 服务 团队搭建：建立研发规范 任职要求 五年经验 我们提供 成长空间";
    const result = formatJobDescriptionForDisplay(text);
    expect(result).toContain("**岗位职责**\n\n");
    expect(result).toContain("Python AI 服务\n\n团队搭建");
    expect(result).toContain("**任职要求**");
    expect(result.replaceAll("**", "").replaceAll(/\s+/g, " ")).toBe(text);
  });
});
