import { describe, expect, it } from "vitest";
import {
  restoreTokenizedJobDescription,
  tokenizeJobDescription,
} from "./ai-job-description-generate";

describe("tokenized JD generation format", () => {
  it("restores the exact user line prefixes and blank lines", () => {
    const original =
      "## 我们需要你\n\n负责前端架构。\n\n### 主要工作\n1. 主导播放页；\n2. 建设工程体系。\n\n### 希望你具备\n- 8 年以上经验；\n- 本科及以上学历。";
    const tokenized = tokenizeJobDescription(original);
    const generated = tokenized.lines
      .map((line, index) => {
        if (!line.content) {
          return line.token;
        }
        return `${line.token}优化后 ${index}`;
      })
      .join("\n");

    expect(restoreTokenizedJobDescription(tokenized, generated)).toEqual({
      jobDescription:
        "## 优化后 0\n\n优化后 2\n\n### 优化后 4\n1. 优化后 5\n2. 优化后 6\n\n### 优化后 8\n- 优化后 9\n- 优化后 10",
      usedGeneratedContent: true,
    });
  });

  it("falls back without claiming supplements when a line token is missing", () => {
    const original = "第一行\n\n第三行";
    const tokenized = tokenizeJobDescription(original);

    expect(
      restoreTokenizedJobDescription(
        tokenized,
        `⟦JD_LINE_0000⟧优化后的第一行\n⟦JD_LINE_0002⟧优化后的第三行`,
      ),
    ).toEqual({ jobDescription: original, usedGeneratedContent: false });
  });
});
