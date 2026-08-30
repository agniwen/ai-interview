// sanitizeTitle — 三段正则 + 截断的纯函数测试 / Pure-function tests for sanitizeTitle.

import { describe, expect, it } from "vitest";
import { sanitizeTitle } from "@app/server/server/routes/resume/utils/title";

describe("sanitizeTitle", () => {
  it("returns short clean titles unchanged", () => {
    expect(sanitizeTitle("简历")).toBe("简历");
    expect(sanitizeTitle("前端工程师 - 郭靖")).toBe("前端工程师 - 郭靖");
  });

  it("strips double quotes, single quotes, and backticks", () => {
    expect(sanitizeTitle('"标题"')).toBe("标题");
    expect(sanitizeTitle("'标题'")).toBe("标题");
    expect(sanitizeTitle("`code`")).toBe("code");
    expect(sanitizeTitle("\"'`混合`'\"")).toBe("混合");
  });

  it("replaces line breaks with a single space", () => {
    expect(sanitizeTitle("第一行\n第二行")).toBe("第一行 第二行");
    expect(sanitizeTitle("第一行\r\n第二行")).toBe("第一行 第二行");
    expect(sanitizeTitle("第一行\r第二行")).toBe("第一行 第二行");
  });

  it("collapses runs of whitespace into a single space", () => {
    expect(sanitizeTitle("前端     工程师")).toBe("前端 工程师");
    expect(sanitizeTitle("a\t\tb")).toBe("a b");
    // 多个换行也通过 whitespace 折叠 / multiple line breaks also collapse
    expect(sanitizeTitle("a\n\n\nb")).toBe("a b");
  });

  it("trims leading and trailing whitespace after replacement", () => {
    expect(sanitizeTitle("   标题   ")).toBe("标题");
    expect(sanitizeTitle("\n  \t标题\t  \n")).toBe("标题");
  });

  it("returns empty string when the input is empty or only whitespace / quotes", () => {
    expect(sanitizeTitle("")).toBe("");
    expect(sanitizeTitle("   ")).toBe("");
    expect(sanitizeTitle("\"\"''``")).toBe("");
  });

  it("truncates at 28 characters", () => {
    const long = "a".repeat(40);
    expect(sanitizeTitle(long)).toHaveLength(28);
    expect(sanitizeTitle(long)).toBe("a".repeat(28));
  });

  it("keeps exactly 28 characters intact", () => {
    const exact = "a".repeat(28);
    expect(sanitizeTitle(exact)).toBe(exact);
  });

  it("applies replacement before truncation (cleanup widens the budget)", () => {
    // 输入 30 个字符 + 引号；剥掉引号后正好 28 个，不需要截断。
    // Input has 30 chars including quotes; after stripping, 28 chars fits the budget exactly.
    const input = `"${"a".repeat(28)}"`;
    expect(sanitizeTitle(input)).toBe("a".repeat(28));
  });

  it("combined: quotes + line breaks + extra whitespace + length cap", () => {
    const input = `"  前端\n\n工程师   ${"x".repeat(40)}  "`;
    const out = sanitizeTitle(input);
    expect(out.length).toBeLessThanOrEqual(28);
    expect(out.startsWith("前端 工程师")).toBe(true);
    expect(out).not.toContain('"');
    expect(out).not.toContain("\n");
  });
});
