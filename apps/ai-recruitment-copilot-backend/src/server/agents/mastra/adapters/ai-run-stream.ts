import type { AiRunEvent } from "@arc/shared/ai-run-events";
import { isAiRunTerminalEvent } from "@arc/shared/ai-run-events";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;

export type AiRunEventEmitter = (event: AiRunEvent) => void;

export function encodeAiRunNdjsonEvent(event: AiRunEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

function toRunError(error: unknown) {
  return { message: error instanceof Error ? error.message : String(error) };
}

export function createAiRunNdjsonStream({
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  run,
  runId,
  title,
  traceId,
  workflowId,
}: {
  heartbeatIntervalMs?: number;
  run: (emit: AiRunEventEmitter) => Promise<unknown>;
  runId: string;
  title: string;
  traceId?: string;
  workflowId?: string;
}): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      let closed = false;
      let terminalEmitted = false;
      const emit = (event: AiRunEvent) => {
        if (closed) {
          return;
        }
        if (isAiRunTerminalEvent(event)) {
          terminalEmitted = true;
        }
        controller.enqueue(encodeAiRunNdjsonEvent(event));
      };
      const heartbeat = setInterval(() => {
        emit({ at: new Date().toISOString(), runId, traceId, type: "run.heartbeat" });
      }, heartbeatIntervalMs);

      try {
        emit({ runId, title, traceId, type: "run.started", workflowId });
        const output = await run(emit);
        if (!terminalEmitted) {
          emit({ output, runId, traceId, type: "run.completed" });
        }
      } catch (error) {
        if (!terminalEmitted) {
          emit({ error: toRunError(error), runId, traceId, type: "run.failed" });
        }
      } finally {
        clearInterval(heartbeat);
        closed = true;
        controller.close();
      }
    },
  });
}
