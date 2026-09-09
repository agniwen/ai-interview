import { z } from "zod";
import { echoAdoptionSchema, echoDeviceContextSchema } from "@app/shared/meeting-device-processing";
import {
  meetingIntelligenceGenerationProgressSchema,
  meetingIntelligenceTemplateSchema,
} from "@app/shared/meeting-intelligence";
import type { TaskContext } from "./scheduler";
import type { MeetingTaskStore } from "./task-store";
import { EchoServerClient } from "./server-client";
import { advanceLocalIntelligence, localIntelligenceResultSchema } from "./intelligence";
import { echoOperationId, readTaskOutput } from "./pipeline-output";
import { MeetingTaskError } from "./task-error";

export const regenerationCheckpointSchema = z.object({
  epoch: z.number().int().positive(),
  progress: meetingIntelligenceGenerationProgressSchema.nullable().optional(),
  server: echoDeviceContextSchema.optional(),
  template: meetingIntelligenceTemplateSchema,
});
export const regenerationResultSchema = localIntelligenceResultSchema.extend({
  server: echoDeviceContextSchema,
});

export function createEchoRegenerationHandlers(input: {
  tasks: MeetingTaskStore;
  client: EchoServerClient;
}) {
  return {
    regenerate: async (context: TaskContext) => {
      const checkpoint = regenerationCheckpointSchema.parse(
        JSON.parse(context.task.checkpoint ?? "null"),
      );
      if (!checkpoint.server) {
        const adopted = await input.client.request(
          `${EchoServerClient.meetingsPath(context.binding)}/${encodeURIComponent(context.binding.resource_meeting_id)}/device/adopt`,
          echoAdoptionSchema,
          {
            accountId: context.binding.account_id,
            body: JSON.stringify({ epoch: checkpoint.epoch, regenerate: true }),
            method: "POST",
            signal: context.signal,
            workspaceId: context.binding.workspace_id,
          },
        );
        checkpoint.server = adopted.context;
        context.checkpoint(z.json().parse(checkpoint));
      }
      const { server } = checkpoint;
      if (!server.transcript) {
        throw new MeetingTaskError("invalid", "最终转录尚未就绪");
      }
      const result = await advanceLocalIntelligence({
        client: input.client,
        context,
        progress: checkpoint.progress ?? null,
        saveProgress: (progress) => {
          checkpoint.progress = progress;
          context.checkpoint(z.json().parse(checkpoint));
        },
        server,
        template: checkpoint.template,
        transcript: server.transcript,
      });
      return { ...result, server };
    },
    "sync-regeneration": (context: TaskContext) => {
      const { server, content, generationOperationId } = readTaskOutput(
        input.tasks,
        context.task.meeting_id,
        "regenerate",
        regenerationResultSchema,
      );
      return input.client.operation(
        `${EchoServerClient.meetingsPath(context.binding)}/${encodeURIComponent(context.binding.resource_meeting_id)}/device/sync/intelligence`,
        z.object({ revisionId: z.string() }),
        {
          accountId: context.binding.account_id,
          body: JSON.stringify({
            content,
            epoch: server.epoch,
            expectedIntelligenceRevisionId: server.intelligenceRevisionId,
            generationOperationId,
            operationId: echoOperationId(context.task.id),
            transcriptRevisionId: server.transcript?.revisionId,
          }),
          signal: context.signal,
          workspaceId: context.binding.workspace_id,
        },
      );
    },
  };
}
