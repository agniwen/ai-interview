import { z } from "zod";
import {
  createMeetingQuestionSchema,
  meetingAnswerPayloadSchema,
} from "@app/shared/meeting-answer";
import type { MeetingTaskStore } from "./task-store";
import type { TaskContext } from "./scheduler";
import { EchoServerClient } from "./server-client";
import { echoOperationId, readTaskOutput } from "./pipeline-output";

export const localQuestionInputSchema = createMeetingQuestionSchema.extend({
  threadId: z.string().min(1),
});
const registrationSchema = z.object({ epoch: z.number(), exchangeId: z.string() });
const checkpointSchema = z.object({
  registration: registrationSchema.optional(),
  request: localQuestionInputSchema,
});
export const localQuestionResultSchema = z.object({
  answer: meetingAnswerPayloadSchema,
  epoch: z.number(),
  exchangeId: z.string(),
  executionToken: z.string(),
  generationOperationId: z.string(),
  request: localQuestionInputSchema,
});

export function createEchoQuestionHandlers(input: {
  tasks: MeetingTaskStore;
  client: EchoServerClient;
}) {
  return {
    question: async (context: TaskContext) => {
      const checkpoint = checkpointSchema.parse(JSON.parse(context.task.checkpoint ?? "null"));
      const path = `${EchoServerClient.meetingsPath(context.binding)}/${encodeURIComponent(context.binding.resource_meeting_id)}/device/questions`;
      const options = {
        accountId: context.binding.account_id,
        signal: context.signal,
        workspaceId: context.binding.workspace_id,
      };
      if (!checkpoint.registration) {
        checkpoint.registration = await input.client.request(`${path}/start`, registrationSchema, {
          ...options,
          body: JSON.stringify(checkpoint.request),
          method: "POST",
        });
        context.checkpoint(checkpoint);
      }
      const generationOperationId = echoOperationId(context.task.id, "generate");
      const result = await input.client.operation(
        `${path}/generate`,
        localQuestionResultSchema.pick({ answer: true, exchangeId: true, executionToken: true }),
        {
          ...options,
          body: JSON.stringify({ ...checkpoint.registration, operationId: generationOperationId }),
        },
      );
      return {
        ...result,
        epoch: checkpoint.registration.epoch,
        generationOperationId,
        request: checkpoint.request,
      };
    },
    "sync-question": (context: TaskContext) => {
      const result = readTaskOutput(
        input.tasks,
        context.task.meeting_id,
        "question",
        localQuestionResultSchema,
      );
      return input.client.operation(
        `${EchoServerClient.meetingsPath(context.binding)}/${encodeURIComponent(context.binding.resource_meeting_id)}/device/questions/sync`,
        z.object({ synchronized: z.literal(true) }),
        {
          accountId: context.binding.account_id,
          body: JSON.stringify({
            epoch: result.epoch,
            generationOperationId: result.generationOperationId,
            operationId: echoOperationId(context.task.id),
          }),
          signal: context.signal,
          workspaceId: context.binding.workspace_id,
        },
      );
    },
  };
}
