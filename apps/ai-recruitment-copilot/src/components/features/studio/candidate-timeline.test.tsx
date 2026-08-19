import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CandidateTimeline } from "./candidate-timeline";

describe("CandidateTimeline", () => {
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
  });
});
