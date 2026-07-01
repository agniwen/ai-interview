import type { AiRunEvent } from "@arc/shared/ai-run-events";
import { isAiRunTerminalEvent } from "@arc/shared/ai-run-events";
import type { WorkflowStreamEvent } from "@mastra/core/stream";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;

export type AiRunEventEmitter = (event: AiRunEvent) => void;

export interface MastraWorkflowEventBridgeOptions {
  stepLabels?: Record<string, string>;
  title?: string;
  traceId?: string;
  workflowId?: string;
}

export function encodeAiRunStreamEvent(event: AiRunEvent): Uint8Array {
  return new TextEncoder().encode(`event: ai-run\ndata: ${JSON.stringify(event)}\n\n`);
}

function toRunError(error: unknown) {
  return { message: error instanceof Error ? error.message : String(error) };
}

function stepLabel(stepId: string, options: MastraWorkflowEventBridgeOptions) {
  return options.stepLabels?.[stepId] ?? stepId;
}

export function mastraWorkflowEventToAiRunEvents(
  event: WorkflowStreamEvent,
  options: MastraWorkflowEventBridgeOptions = {},
): AiRunEvent[] {
  const { runId } = event;
  const { traceId } = options;
  if (event.type === "workflow-start") {
    const workflowId = options.workflowId ?? event.payload.workflowId;
    return [
      {
        runId,
        title: options.title ?? workflowId,
        traceId,
        type: "run.started",
        workflowId,
      },
    ];
  }
  if (event.type === "workflow-step-start") {
    return [
      {
        label: stepLabel(event.payload.id, options),
        runId,
        stepId: event.payload.id,
        traceId,
        type: "step.started",
      },
    ];
  }
  if (event.type === "workflow-step-progress") {
    return [
      {
        progress:
          event.payload.totalCount > 0
            ? event.payload.completedCount / event.payload.totalCount
            : undefined,
        runId,
        stepId: event.payload.id,
        traceId,
        type: "step.progress",
      },
    ];
  }
  if (event.type === "workflow-step-result") {
    return [
      {
        output: event.payload.output,
        runId,
        stepId: event.payload.id,
        traceId,
        type: "step.completed",
      },
    ];
  }
  if (event.type === "workflow-step-suspended") {
    return [
      {
        payload: event.payload.suspendPayload,
        runId,
        suspended: [event.payload.id],
        traceId,
        type: "run.suspended",
      },
    ];
  }
  if (event.type === "workflow-finish") {
    if (event.payload.workflowStatus === "success") {
      return [{ output: event.payload.metadata, runId, traceId, type: "run.completed" }];
    }
    return [
      {
        error: { detail: event.payload.metadata, message: event.payload.workflowStatus },
        runId,
        traceId,
        type: "run.failed",
      },
    ];
  }
  if (event.type === "workflow-canceled") {
    return [{ error: { message: "Workflow canceled" }, runId, traceId, type: "run.failed" }];
  }
  return [];
}

export async function emitMastraWorkflowStreamEvents(
  stream: AsyncIterable<WorkflowStreamEvent>,
  emit: AiRunEventEmitter,
  options: MastraWorkflowEventBridgeOptions = {},
): Promise<void> {
  for await (const event of stream) {
    for (const aiRunEvent of mastraWorkflowEventToAiRunEvents(event, options)) {
      emit(aiRunEvent);
    }
  }
}

export function createAiRunEventStream({
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
        controller.enqueue(encodeAiRunStreamEvent(event));
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
