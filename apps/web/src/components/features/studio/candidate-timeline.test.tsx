import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CandidateTimeline } from "./candidate-timeline";

describe("CandidateTimeline", () => {
  it("keeps the real activity layer mounted while its skeleton is loading", () => {
    const html = renderToStaticMarkup(
      <CandidateTimeline data={null} isLoading showHeading={false} />,
    );

    expect(html).toContain('data-slot="skeleton-reveal"');
    expect(html).toContain('data-state="loading"');
    expect(html).toContain('data-slot="skeleton-reveal-placeholder"');
    expect(html).toContain('data-slot="skeleton-reveal-content"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders no placeholder when the activity list is empty", () => {
    const html = renderToStaticMarkup(
      <CandidateTimeline
        data={{
          events: [],
          summary: {
            currentOutcomeLabel: "进行中",
            currentStageLabel: "简历筛选",
            latestAt: null,
            totalEvents: 0,
          },
        }}
        isLoading={false}
        showHeading={false}
      />,
    );

    expect(html).not.toContain("暂无活动记录");
    expect(html).not.toContain('data-slot="empty-icon"');
    expect(html).toContain('data-state="revealed"');
  });
});

it("展示流程说明、操作者与Offer响应结果", () => {
  const html = renderToStaticMarkup(
    <CandidateTimeline
      data={{
        events: [
          {
            actorImage: null,
            actorName: "艾伦",
            description: "简历筛选 → AI 初面",
            id: "advance",
            kind: "audit",
            metadata: [],
            occurredAt: "2026-09-05T00:00:00Z",
            title: "推进招聘阶段",
            tone: "info",
          },
          {
            actorImage: null,
            actorName: "艾伦",
            description: "记录候选人 Offer v1 回复：接受",
            id: "offer",
            kind: "audit",
            metadata: [],
            occurredAt: "2026-09-05T00:01:00Z",
            title: "候选人回复 Offer",
            tone: "info",
          },
        ],
        summary: {
          currentOutcomeLabel: "进行中",
          currentStageLabel: "AI 初面",
          latestAt: null,
          totalEvents: 2,
        },
      }}
      isLoading={false}
    />,
  );
  expect(html).toContain("简历筛选 → AI 初面");
  expect(html).toContain("艾伦");
  expect(html).toContain("回复：接受");
});
