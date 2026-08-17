import {
  createAiRunEventStream,
  encodeAiRunStreamEvent,
  emitMastraWorkflowStreamEvents,
  mastraWorkflowEventToAiRunEvents,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/adapters/ai-run-stream";
import { describe, expect, it, vi } from "vitest";

interface SseEvent {
  type: string;
}

async function readEvents(stream: ReadableStream<Uint8Array>) {
  const text = await new Response(stream).text();
  return text
    .split("\n\n")
    .map((frame) => frame.trim())
    .filter(Boolean)
    .map((frame) => {
      const data = frame
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice("data: ".length);
      if (!data) {
        throw new Error(`Missing SSE data frame: ${frame}`);
      }
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      return JSON.parse(data) as SseEvent;
    });
}

describe("AiRun event stream", () => {
  it("encodes one event per SSE frame", () => {
    expect(
      new TextDecoder().decode(
        encodeAiRunStreamEvent({ runId: "run-1", title: "分析简历", type: "run.started" }),
      ),
    ).toBe('event: ai-run\ndata: {"runId":"run-1","title":"分析简历","type":"run.started"}\n\n');
  });

  it("emits run lifecycle events around custom events", async () => {
    const events = await readEvents(
      createAiRunEventStream({
        run: (emit) => {
          emit({ label: "读取简历", runId: "run-1", stepId: "load", type: "step.started" });
          return Promise.resolve({ ok: true });
        },
        runId: "run-1",
        title: "分析简历",
        workflowId: "resume-analysis",
      }),
    );

    expect(events).toEqual([
      {
        runId: "run-1",
        title: "分析简历",
        type: "run.started",
        workflowId: "resume-analysis",
      },
      { label: "读取简历", runId: "run-1", stepId: "load", type: "step.started" },
      { output: { ok: true }, runId: "run-1", type: "run.completed" },
    ]);
  });

  it("turns thrown errors into run.failed events", async () => {
    const events = await readEvents(
      createAiRunEventStream({
        run: () => Promise.reject(new Error("解析失败")),
        runId: "run-1",
        title: "分析简历",
      }),
    );

    expect(events.at(-1)).toEqual({
      error: { message: "解析失败" },
      runId: "run-1",
      type: "run.failed",
    });
  });

  it("does not auto-complete when the runner emits a terminal event", async () => {
    const emitTerminal = vi.fn((emit) => {
      emit({ output: { emitted: true }, runId: "run-1", type: "run.completed" });
    });

    const events = await readEvents(
      createAiRunEventStream({
        run: (emit) => {
          emitTerminal(emit);
          return Promise.resolve();
        },
        runId: "run-1",
        title: "分析简历",
      }),
    );

    expect(events.filter((event) => event.type === "run.completed")).toHaveLength(1);
  });

  it("maps Mastra workflow stream events into stable AiRunEvent objects", () => {
    expect(
      mastraWorkflowEventToAiRunEvents(
        // SAFETY: This test constructs the value with the asserted contract before this boundary.
        {
          from: "WORKFLOW",
          payload: { id: "summary", status: "running", stepCallId: "call-1" },
          runId: "run-1",
          type: "workflow-step-start",
        } as never,
        { stepLabels: { summary: "生成摘要" } },
      ),
    ).toEqual([{ label: "生成摘要", runId: "run-1", stepId: "summary", type: "step.started" }]);

    expect(
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      mastraWorkflowEventToAiRunEvents({
        from: "WORKFLOW",
        payload: {
          completedCount: 1,
          currentIndex: 0,
          id: "foreach",
          iterationStatus: "success",
          totalCount: 4,
        },
        runId: "run-1",
        type: "workflow-step-progress",
      } as never),
    ).toEqual([
      {
        progress: 0.25,
        runId: "run-1",
        stepId: "foreach",
        type: "step.progress",
      },
    ]);

    expect(
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      mastraWorkflowEventToAiRunEvents({
        from: "WORKFLOW",
        payload: { id: "summary", output: { summary: "ok" }, status: "success", stepCallId: "c" },
        runId: "run-1",
        type: "workflow-step-result",
      } as never),
    ).toEqual([
      {
        output: { summary: "ok" },
        runId: "run-1",
        stepId: "summary",
        type: "step.completed",
      },
    ]);
  });

  it("emits converted events from a Mastra workflow stream", async () => {
    const emitted: unknown[] = [];

    await emitMastraWorkflowStreamEvents(
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      [
        {
          from: "WORKFLOW",
          payload: { id: "summary", status: "running", stepCallId: "call-1" },
          runId: "run-1",
          type: "workflow-step-start",
        },
      ] as never,
      (event) => {
        emitted.push(event);
      },
      { stepLabels: { summary: "生成摘要" } },
    );

    expect(emitted).toEqual([
      { label: "生成摘要", runId: "run-1", stepId: "summary", type: "step.started" },
    ]);
  });
});
