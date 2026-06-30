import type { AiRunEvent } from "./ai-run-events";

/**
 * 简历分析 / 面试题生成的旧 NDJSON 流事件。保留给现有前端渐进迁移。
 *
 * Legacy NDJSON stream event for current resume analysis consumers.
 */
export type LegacyAnalysisStreamEvent =
  | { type: "status"; message: string }
  | { type: "tool-start"; name: string }
  | { type: "tool-end"; name: string }
  | { type: "text-delta"; text: string }
  | { type: "step"; index: number }
  | { type: "result"; data: unknown }
  | { type: "error"; message: string }
  | { type: "heartbeat"; timestamp: number };

/**
 * 简历分析 / 面试题生成的 NDJSON 流事件。新代码优先使用 AiRunEvent；
 * 旧前端仍可消费 LegacyAnalysisStreamEvent。
 */
export type AnalysisStreamEvent = LegacyAnalysisStreamEvent | AiRunEvent;

export interface AiRunEventBridgeContext {
  defaultStepId?: string;
  runId: string;
  traceId?: string;
}

function slugifyStepId(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replaceAll(/[^\w\s:-]/g, "")
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_:]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");
  if (ascii) {
    return ascii;
  }
  const unicode = [...value.trim()]
    .map((char) => `u${char.codePointAt(0)?.toString(16) ?? "0"}`)
    .join("-");
  return unicode || "step";
}

export function aiRunEventToAnalysisStreamEvent(
  event: AiRunEvent,
): LegacyAnalysisStreamEvent | null {
  if (event.type === "run.started") {
    return { message: event.title, type: "status" };
  }
  if (event.type === "run.heartbeat") {
    return { timestamp: Date.parse(event.at), type: "heartbeat" };
  }
  if (event.type === "step.started") {
    return { name: event.label, type: "tool-start" };
  }
  if (event.type === "step.progress" && event.label) {
    return { message: event.label, type: "status" };
  }
  if (event.type === "step.delta") {
    return { text: event.text, type: "text-delta" };
  }
  if (event.type === "tool.started") {
    return { name: event.label || event.toolName, type: "tool-start" };
  }
  if (event.type === "tool.completed") {
    return { name: event.toolName, type: "tool-end" };
  }
  if (event.type === "step.completed") {
    return { name: event.stepId, type: "tool-end" };
  }
  if (event.type === "artifact.created") {
    return { data: event.data, type: "result" };
  }
  if (event.type === "run.completed") {
    return { data: event.output, type: "result" };
  }
  if (event.type === "run.failed") {
    return { message: event.error.message, type: "error" };
  }
  if (event.type === "run.suspended") {
    return { message: "AI 流程已暂停，等待确认。", type: "status" };
  }
  if (event.type === "run.resumed") {
    return { message: "AI 流程已继续。", type: "status" };
  }
  if (event.type === "approval.required") {
    return { message: "等待人工确认。", type: "status" };
  }
  if (event.type === "scorer.completed") {
    return { message: `评估完成：${Math.round(event.score * 100)}%`, type: "status" };
  }
  return null;
}

export function analysisStreamEventToAiRunEvents(
  event: LegacyAnalysisStreamEvent,
  context: AiRunEventBridgeContext,
): AiRunEvent[] {
  const { traceId } = context;
  const defaultStepId = context.defaultStepId ?? "analysis";
  if (event.type === "status") {
    return [
      {
        label: event.message,
        runId: context.runId,
        stepId: defaultStepId,
        traceId,
        type: "step.progress",
      },
    ];
  }
  if (event.type === "heartbeat") {
    return [
      {
        at: new Date(event.timestamp).toISOString(),
        runId: context.runId,
        traceId,
        type: "run.heartbeat",
      },
    ];
  }
  if (event.type === "tool-start") {
    return [
      {
        label: event.name,
        runId: context.runId,
        stepId: `tool:${slugifyStepId(event.name)}`,
        traceId,
        type: "step.started",
      },
    ];
  }
  if (event.type === "tool-end") {
    return [
      {
        output: { name: event.name },
        runId: context.runId,
        stepId: `tool:${slugifyStepId(event.name)}`,
        traceId,
        type: "step.completed",
      },
    ];
  }
  if (event.type === "text-delta") {
    return [
      {
        runId: context.runId,
        stepId: defaultStepId,
        text: event.text,
        traceId,
        type: "step.delta",
      },
    ];
  }
  if (event.type === "step") {
    return [
      {
        progress: event.index,
        runId: context.runId,
        stepId: `step:${event.index}`,
        traceId,
        type: "step.progress",
      },
    ];
  }
  if (event.type === "result") {
    return [{ output: event.data, runId: context.runId, traceId, type: "run.completed" }];
  }
  return [
    {
      error: { message: event.message },
      runId: context.runId,
      traceId,
      type: "run.failed",
    },
  ];
}
