import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getAiRoundResetBehavior, PipelineStageActionBar } from "../pipeline-stage-action-bar";

describe("getAiRoundResetBehavior", () => {
  it("resets a pending round directly", () => {
    expect(getAiRoundResetBehavior("pending")).toBe("direct");
  });

  it("confirms before resetting a completed round", () => {
    expect(getAiRoundResetBehavior("completed")).toBe("confirm");
  });

  it.each(["in_progress", "interrupted"] as const)(
    "disables reset while a round is %s",
    (status) => {
      expect(getAiRoundResetBehavior(status)).toBe("disabled");
    },
  );
});

describe("PipelineStageActionBar", () => {
  it("keeps the current-stage trigger free of hover borders and shadows", () => {
    const markup = renderToStaticMarkup(
      createElement(PipelineStageActionBar, {
        onAdvance: () => {},
        onRequestClose: () => {},
        onRequestReactivate: () => {},
        onViewCurrentStage: () => {},
        pipelineStage: "screening",
      }),
    );
    const stageTrigger = markup.match(
      /<button[^>]*aria-label="查看当前阶段：简历筛选"[^>]*>/u,
    )?.[0];

    expect(stageTrigger).toContain('data-variant="text"');
    expect(stageTrigger).toContain("hover:border-transparent");
    expect(stageTrigger).toContain("shadow-none");
    expect(stageTrigger).not.toContain("hover:border-border/80");
  });
});
