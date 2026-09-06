import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PipelineStageActionBar, getAiRoundResetBehavior } from "../pipeline-stage-action-bar";

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

describe("流程回退入口", () => {
  it.each(["screening", "second_interview", "onboarding", "closed"] as const)(
    "%s 阶段按规则显示回退入口，不依赖推进权限",
    (pipelineStage) => {
      const markup = renderToStaticMarkup(
        createElement(PipelineStageActionBar, {
          canCreateHumanInterview: false,
          canCreateOffer: false,
          onAdvance: vi.fn(),
          onRequestClose: vi.fn(),
          onRequestReactivate: vi.fn(),
          onViewCurrentStage: vi.fn(),
          pipelineStage,
        }),
      );
      if (pipelineStage === "screening") {
        expect(markup).not.toContain("回到之前节点");
      } else {
        expect(markup).toContain("回到之前节点");
      }
      expect(markup).not.toContain("直接安排复试");
    },
  );
});

describe("真实节点推进与状态标签区分", () => {
  it.each([
    ["income_proof", "进入谈薪"],
    ["offer", "进入背调"],
    ["background_check", "进入入职"],
  ] as const)("%s 只推进到下一真实节点", (pipelineStage, label) => {
    const markup = renderToStaticMarkup(
      createElement(PipelineStageActionBar, {
        canCreateHumanInterview: true,
        canCreateOffer: true,
        currentNodePassed: true,
        hasJobDescription: true,
        onAdvance: vi.fn(),
        onRequestClose: vi.fn(),
        onRequestReactivate: vi.fn(),
        onViewCurrentStage: vi.fn(),
        pipelineStage,
      }),
    );
    expect(markup).toContain(label);
    expect(markup).not.toContain("进入谈薪发 Offer");
    expect(markup).not.toContain("进入已入职");
  });
});
