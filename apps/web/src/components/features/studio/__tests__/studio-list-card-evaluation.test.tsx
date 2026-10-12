import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  StudioListCardEvaluationFocus,
  StudioListCardEvaluationSkeleton,
} from "../studio-list-card-evaluation";

function point(name: string, content: string) {
  return { content, jobRequirement: `${name}相关要求`, point: name, resumeEvidence: null };
}

describe("StudioListCardEvaluationFocus", () => {
  it("renders the historical restricted Markdown excerpt and nothing when it is missing", () => {
    const html = renderToStaticMarkup(
      <StudioListCardEvaluationFocus
        focus={{ format: "markdown", text: "- **主导**增长项目\n- 管理 10 人团队" }}
      />,
    );
    expect(html).toContain("<strong>主导</strong>");
    expect(html).toContain("<li>");
    expect(renderToStaticMarkup(<StudioListCardEvaluationFocus focus={null} />)).toBe("");
    expect(
      renderToStaticMarkup(
        <StudioListCardEvaluationFocus focus={{ format: "markdown", text: "  " }} />,
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <StudioListCardEvaluationFocus focus={{ format: "points", items: [], kind: "risk" }} />,
      ),
    ).toBe("");
  });

  it("leads each structured point with its requirement and shows at most four points", () => {
    const html = renderToStaticMarkup(
      <StudioListCardEvaluationFocus
        focus={{
          format: "points",
          items: [
            point("早期投资经验", "主导完成 10 个投资项目。"),
            point("海外背景", "具备海外学习经历。"),
            point("行业理解", "熟悉 AI 应用方向。"),
            point("项目源", "有稳定的项目渠道。"),
            point("第五条", "不应在卡片中展示。"),
          ],
          kind: "matching",
        }}
      />,
    );
    const items = html.split("<li").slice(1);
    expect(items).toHaveLength(4);
    expect(items[0]?.indexOf("早期投资经验")).toBeLessThan(
      items[0]?.indexOf("主导完成 10 个投资项目。") ?? 0,
    );
    expect(html).not.toContain("不应在卡片中展示。");
  });

  it("announces the parsing placeholder", () => {
    expect(renderToStaticMarkup(<StudioListCardEvaluationSkeleton />)).toContain(
      'aria-label="简历解析中"',
    );
  });
});
