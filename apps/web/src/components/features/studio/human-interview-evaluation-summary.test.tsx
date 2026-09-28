import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { evaluation } from "../human-interview/human-meeting-review.test-fixtures";
import { RoundEvaluation } from "./human-interview-evaluation-summary";

describe("human interview overall evaluation Markdown", () => {
  it.each([true, false])("renders Markdown in compact=%s summaries", (compact) => {
    const html = renderToStaticMarkup(
      <RoundEvaluation
        compact={compact}
        evaluation={{
          ...evaluation,
          overallEvaluation: "**核心评价**\n\n- 沟通清晰\n\n1. 继续面试",
        }}
        round={{ evaluationStatus: "submitted" }}
      />,
    );
    expect(html).toContain("<strong>核心评价</strong>");
    expect(html).toContain("<ul>\n<li>沟通清晰</li>\n</ul>");
    expect(html).toContain("<ol>\n<li>继续面试</li>\n</ol>");
    expect(html).not.toContain("**核心评价**");
  });

  it("keeps the empty evaluation placeholder", () => {
    const html = renderToStaticMarkup(
      <RoundEvaluation
        evaluation={{ ...evaluation, overallEvaluation: " " }}
        round={{ evaluationStatus: "submitted" }}
      />,
    );
    expect(html).toContain(">-</p>");
    expect(html).not.toContain("<li></li>");
  });
});
