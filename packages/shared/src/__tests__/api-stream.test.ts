import { describe, expect, it } from "vitest";
import { aiRunEventToAnalysisStreamEvent, analysisStreamEventToAiRunEvents } from "../api-stream";

describe("api stream event bridge", () => {
  it("maps AiRunEvent progress into the legacy analysis stream shape", () => {
    expect(
      aiRunEventToAnalysisStreamEvent({
        label: "OCR 识别简历",
        runId: "run-1",
        stepId: "ocr",
        type: "step.started",
      }),
    ).toEqual({ name: "OCR 识别简历", type: "tool-start" });

    expect(
      aiRunEventToAnalysisStreamEvent({
        runId: "run-1",
        stepId: "review",
        text: "评价草稿",
        type: "step.delta",
      }),
    ).toEqual({ text: "评价草稿", type: "text-delta" });
  });

  it("maps terminal AiRunEvent objects for old consumers", () => {
    expect(
      aiRunEventToAnalysisStreamEvent({
        output: { ok: true },
        runId: "run-1",
        type: "run.completed",
      }),
    ).toEqual({ data: { ok: true }, type: "result" });

    expect(
      aiRunEventToAnalysisStreamEvent({
        error: { message: "解析失败" },
        runId: "run-1",
        type: "run.failed",
      }),
    ).toEqual({ message: "解析失败", type: "error" });
  });

  it("maps legacy analysis stream events into AiRunEvent objects", () => {
    expect(
      analysisStreamEventToAiRunEvents(
        { name: "提取结构化字段", type: "tool-start" },
        {
          runId: "run-1",
        },
      ),
    ).toEqual([
      {
        label: "提取结构化字段",
        runId: "run-1",
        stepId: "tool:u63d0-u53d6-u7ed3-u6784-u5316-u5b57-u6bb5",
        traceId: undefined,
        type: "step.started",
      },
    ]);

    expect(
      analysisStreamEventToAiRunEvents({ data: { done: true }, type: "result" }, { runId: "r" }),
    ).toEqual([{ output: { done: true }, runId: "r", traceId: undefined, type: "run.completed" }]);
  });
});
