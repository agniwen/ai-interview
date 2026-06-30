import { describe, expect, it, vi } from "vitest";
import {
  createAiRunNdjsonStream,
  encodeAiRunNdjsonEvent,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/adapters/ai-run-stream";

async function readEvents(stream: ReadableStream<Uint8Array>) {
  const text = await new Response(stream).text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; [key: string]: unknown });
}

describe("AiRun NDJSON stream", () => {
  it("encodes one event per NDJSON line", () => {
    expect(
      new TextDecoder().decode(
        encodeAiRunNdjsonEvent({ runId: "run-1", title: "分析简历", type: "run.started" }),
      ),
    ).toBe('{"runId":"run-1","title":"分析简历","type":"run.started"}\n');
  });

  it("emits run lifecycle events around custom events", async () => {
    const events = await readEvents(
      createAiRunNdjsonStream({
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
      createAiRunNdjsonStream({
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
      createAiRunNdjsonStream({
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
});
