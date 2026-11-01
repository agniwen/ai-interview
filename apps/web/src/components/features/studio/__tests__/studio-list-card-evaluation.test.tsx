// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  StudioListCardAiVerdictBadge,
  StudioListCardEvaluationFocus,
  StudioListCardEvaluationSkeleton,
} from "../studio-list-card-evaluation";

function point(name: string, content: string, kind: "matching" | "risk" = "matching") {
  return { content, jobRequirement: `${name}相关要求`, kind, point: name, resumeEvidence: null };
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
        <StudioListCardEvaluationFocus focus={{ format: "points", items: [] }} />,
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
            point("行业理解", "缺少 AI 应用方向经验。", "risk"),
            point("项目源", "项目渠道待确认。", "risk"),
            point("第五条", "不应在卡片中展示。", "risk"),
          ],
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

function renderVerdict(label: string, compact: boolean) {
  const element = document.createElement("div");
  element.innerHTML = renderToStaticMarkup(
    <StudioListCardAiVerdictBadge compact={compact} label={label} tone="highlight" />,
  );
  const badge = element.querySelector<HTMLElement>('[data-slot="studio-list-card-ai-verdict"]');
  const visible = [...(badge?.childNodes ?? [])]
    .filter((node) => !(node instanceof HTMLElement && node.classList.contains("sr-only")))
    .map((node) => node.textContent)
    .join("");
  return { badge, visible };
}

describe("StudioListCardAiVerdictBadge", () => {
  it("abbreviates 非常推荐 under the avatar but keeps the full verdict for title and readers", () => {
    const { badge, visible } = renderVerdict("非常推荐", true);
    expect(visible).toBe("推荐");
    expect(badge?.title).toBe("AI 评价：非常推荐");
    expect(badge?.textContent).toContain("AI 评价：");
    expect(badge?.querySelector(".sr-only:last-child")?.textContent).toBe("非常推荐");
  });

  it("shows other verdicts and the full-size badge unchanged", () => {
    expect(renderVerdict("待定", true).visible).toBe("待定");
    expect(renderVerdict("非常推荐", false).visible).toBe("非常推荐");
  });
});
