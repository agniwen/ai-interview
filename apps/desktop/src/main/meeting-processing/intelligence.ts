import { z } from "zod";
import {
  echoDeviceContextSchema,
  echoIntelligenceStepResultSchema,
  echoTranscriptSchema,
} from "@app/shared/meeting-device-processing";
import type { EchoDeviceContext, EchoTranscript } from "@app/shared/meeting-device-processing";
import {
  meetingIntelligenceGenerationProgressSchema,
  meetingIntelligencePayloadSchema,
} from "@app/shared/meeting-intelligence";
import type {
  MeetingIntelligenceGenerationProgress,
  MeetingIntelligenceTemplate,
} from "@app/shared/meeting-intelligence";
import type { MeetingTaskStore } from "./task-store";
import type { TaskContext } from "./scheduler";
import { EchoServerClient } from "./server-client";
import { echoOperationId, readTaskOutput } from "./pipeline-output";

export const localIntelligenceResultSchema = z.object({
  content: meetingIntelligencePayloadSchema,
  generationOperationId: z.string().nullable(),
});

export async function advanceLocalIntelligence(input: {
  client: EchoServerClient;
  context: TaskContext;
  server: EchoDeviceContext;
  transcript: EchoTranscript;
  template: MeetingIntelligenceTemplate;
  progress: MeetingIntelligenceGenerationProgress | null;
  saveProgress: (progress: MeetingIntelligenceGenerationProgress) => void;
}) {
  let { progress } = input;
  const { context, server } = input;
  while (!context.signal.aborted) {
    const generationOperationId = echoOperationId(context.task.id, JSON.stringify(progress));
    const result = await input.client.operation(
      `${EchoServerClient.meetingsPath(context.binding)}/${encodeURIComponent(context.binding.resource_meeting_id)}/device/intelligence/step`,
      echoIntelligenceStepResultSchema,
      {
        accountId: context.binding.account_id,
        body: JSON.stringify({
          epoch: server.epoch,
          generator: server.intelligenceModel,
          operationId: generationOperationId,
          progress,
          template: input.template,
          transcript: input.transcript,
        }),
        signal: context.signal,
        workspaceId: context.binding.workspace_id,
      },
    );
    if (result.state === "ready") {
      return { content: result.content, generationOperationId };
    }
    ({ progress } = result);
    input.saveProgress(progress);
  }
  context.signal.throwIfAborted();
  throw new Error("纪要处理已暂停");
}

export function createLocalIntelligenceHandler(tasks: MeetingTaskStore, client: EchoServerClient) {
  return (context: TaskContext) => {
    const server = readTaskOutput(
      tasks,
      context.task.meeting_id,
      "register",
      echoDeviceContextSchema,
    );
    if (server.intelligence) {
      return Promise.resolve({ content: server.intelligence, generationOperationId: null });
    }
    return advanceLocalIntelligence({
      client,
      context,
      progress: meetingIntelligenceGenerationProgressSchema
        .nullable()
        .parse(context.task.checkpoint ? JSON.parse(context.task.checkpoint) : null),
      saveProgress: (progress) => context.checkpoint(z.json().parse(progress)),
      server,
      template: server.suggestedTemplate,
      transcript: readTaskOutput(
        tasks,
        context.task.meeting_id,
        "transcript",
        echoTranscriptSchema,
      ),
    });
  };
}
