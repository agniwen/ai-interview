/**
 * Read the project's AI run event stream.
 *
 * The backend sends Server-Sent Event frames shaped as:
 *   event: ai-run
 *   data: {...AiRunEvent}
 */
import type { AnalysisStreamEvent } from "@app/shared/api-stream";
import { z } from "zod";

const aiRunErrorSchema = z.object({
  code: z.string().optional(),
  detail: z.unknown().optional(),
  message: z.string(),
});

const aiRunEventMetadataSchema = z.object({
  runId: z.string(),
  traceId: z.string().optional(),
});

export const analysisStreamEventSchema: z.ZodType<AnalysisStreamEvent> = z.discriminatedUnion(
  "type",
  [
    aiRunEventMetadataSchema.extend({
      agentId: z.string().optional(),
      title: z.string(),
      type: z.literal("run.started"),
      workflowId: z.string().optional(),
    }),
    aiRunEventMetadataSchema.extend({ at: z.string(), type: z.literal("run.heartbeat") }),
    aiRunEventMetadataSchema.extend({
      label: z.string(),
      stepId: z.string(),
      type: z.literal("step.started"),
    }),
    aiRunEventMetadataSchema.extend({
      detail: z.unknown().optional(),
      label: z.string().optional(),
      progress: z.number().optional(),
      stepId: z.string(),
      type: z.literal("step.progress"),
    }),
    aiRunEventMetadataSchema.extend({
      stepId: z.string(),
      text: z.string(),
      type: z.literal("step.delta"),
    }),
    aiRunEventMetadataSchema.extend({
      artifactType: z.string(),
      data: z.unknown(),
      stepId: z.string(),
      type: z.literal("step.preview"),
    }),
    aiRunEventMetadataSchema.extend({
      input: z.unknown().optional(),
      label: z.string(),
      toolCallId: z.string(),
      toolName: z.string(),
      type: z.literal("tool.started"),
    }),
    aiRunEventMetadataSchema.extend({
      output: z.unknown().optional(),
      toolCallId: z.string(),
      toolName: z.string(),
      type: z.literal("tool.completed"),
    }),
    aiRunEventMetadataSchema.extend({
      payload: z.unknown(),
      stepId: z.string().optional(),
      toolCallId: z.string().optional(),
      type: z.literal("approval.required"),
    }),
    aiRunEventMetadataSchema.extend({
      payload: z.unknown().optional(),
      suspended: z.array(z.string()),
      type: z.literal("run.suspended"),
    }),
    aiRunEventMetadataSchema.extend({
      stepId: z.string().optional(),
      type: z.literal("run.resumed"),
    }),
    aiRunEventMetadataSchema.extend({
      artifactId: z.string().optional(),
      artifactType: z.string(),
      data: z.unknown(),
      type: z.literal("artifact.created"),
    }),
    aiRunEventMetadataSchema.extend({
      reason: z.string().optional(),
      score: z.number(),
      scorerId: z.string(),
      type: z.literal("scorer.completed"),
    }),
    aiRunEventMetadataSchema.extend({
      output: z.unknown().optional(),
      stepId: z.string(),
      type: z.literal("step.completed"),
    }),
    aiRunEventMetadataSchema.extend({
      output: z.unknown().optional(),
      type: z.literal("run.completed"),
    }),
    aiRunEventMetadataSchema.extend({ error: aiRunErrorSchema, type: z.literal("run.failed") }),
  ],
);

export async function readAiRunEventStream<T>(
  response: Response,
  eventSchema: z.ZodType<T>,
  onEvent: (event: T) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is empty");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  const parseFrame = (frame: string) => {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n");
    if (!data) {
      return;
    }
    try {
      const event = eventSchema.safeParse(JSON.parse(data));
      if (event.success) {
        onEvent(event.data);
      }
    } catch {
      // Ignore malformed frames so one bad event does not abort the stream.
    }
  };

  try {
    while (true) {
      if (signal?.aborted) {
        break;
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        parseFrame(frame.trim());
      }
    }

    if (buffer.trim()) {
      parseFrame(buffer.trim());
    }
  } finally {
    reader.releaseLock();
  }
}
