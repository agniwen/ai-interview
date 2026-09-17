import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { canonicalizeDeepgramLiveTranscriptDraft } from "@app/shared/meeting-deepgram-transcript";
import { canonicalMeetingTranscriptSchema } from "@app/shared/meeting-transcription";
import {
  echoArtifactSchema,
  echoDeviceContextSchema,
  echoTranscriptSchema,
} from "@app/shared/meeting-device-processing";
import { mergeMeetingTranscriptionChunkResults } from "@app/meeting-media";
import type { LocalMeetingRecordingStore } from "../meeting-capture/local-meeting-recording-store";
import type { MeetingTaskStore } from "./task-store";
import type { TaskContext } from "./scheduler";
import { EchoServerClient } from "./server-client";
import { createEchoArtifactUploader } from "./artifact-upload";
import { localMediaOutputSchema } from "./media";
import { echoOperationId, readTaskOutput } from "./pipeline-output";
import { MeetingTaskError } from "./task-error";

const checkpointSchema = z.object({
  attempts: z.record(z.string(), z.number().int().nonnegative()),
  completed: z.record(z.string(), canonicalMeetingTranscriptSchema),
  submissions: z.record(z.string(), z.object({ operationId: z.string(), taskId: z.string() })),
});
const pollSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("pending") }),
  z.object({ state: z.literal("ready"), transcript: canonicalMeetingTranscriptSchema }),
  z.object({ message: z.string(), state: z.literal("failed") }),
]);

export function createLocalTranscriptionHandler(input: {
  tasks: MeetingTaskStore;
  recordings: LocalMeetingRecordingStore;
  client: EchoServerClient;
  allowedUploadOrigin: string;
}) {
  const upload = createEchoArtifactUploader(input.client, input.allowedUploadOrigin);
  return async (context: TaskContext) => {
    const server = readTaskOutput(
      input.tasks,
      context.task.meeting_id,
      "register",
      echoDeviceContextSchema,
    );
    if (server.transcript) {
      return server.transcript;
    }
    const descriptor = server;
    const revisionId = echoOperationId(context.task.id, "transcript");
    const draft = descriptor.liveTranscriptDraft;
    if (draft?.provider === "deepgram") {
      const transcript = canonicalizeDeepgramLiveTranscriptDraft(
        draft,
        new Date(descriptor.startedAt),
      );
      if (!draft.model || transcript.turns.length === 0) {
        throw new MeetingTaskError("invalid", "Deepgram 实时转录没有可用完整片段，原始录音已保留");
      }
      return echoTranscriptSchema.parse({
        ...transcript,
        model: draft.model,
        pipelineVersion: "deepgram-live-v1",
        provider: "deepgram",
        region: "global",
        revisionId,
        turns: transcript.turns.map((turn, index) => ({ ...turn, id: `${revisionId}:${index}` })),
      });
    }
    const media = readTaskOutput(
      input.tasks,
      context.task.meeting_id,
      "media",
      localMediaOutputSchema,
    );
    const checkpoint = checkpointSchema.parse(
      context.task.checkpoint
        ? JSON.parse(context.task.checkpoint)
        : { attempts: {}, completed: {}, submissions: {} },
    );
    const devicePath = `${EchoServerClient.meetingsPath(context.binding)}/${encodeURIComponent(context.task.meeting_id)}/device`;
    for (const chunk of media.chunks) {
      const key = `${chunk.track}:${chunk.index}`;
      if (checkpoint.completed[key]) {
        continue;
      }
      let submission = checkpoint.submissions[key];
      if (!submission) {
        const artifact = echoArtifactSchema.parse({
          ...chunk,
          artifactId: echoOperationId(context.task.id, key, "artifact"),
          kind: "chunk",
        });
        await upload(context, server.epoch, chunk.filePath, artifact);
        const operationId = echoOperationId(
          context.task.id,
          key,
          "submit",
          String(checkpoint.attempts[key] ?? 0),
        );
        const response = await input.client.operation(
          `${devicePath}/transcription/submit`,
          z.object({ taskId: z.string() }),
          {
            accountId: context.binding.account_id,
            body: JSON.stringify({
              artifact,
              chunk: {
                endMs: chunk.endMs,
                index: chunk.index,
                startMs: chunk.startMs,
                track: chunk.track,
              },
              epoch: server.epoch,
              model: server.transcription.model,
              operationId,
            }),
            signal: context.signal,
            workspaceId: context.binding.workspace_id,
          },
        );
        submission = { operationId, taskId: response.taskId };
        checkpoint.submissions[key] = submission;
        context.checkpoint(checkpoint);
      }
      while (!context.signal.aborted) {
        const result = await input.client.request(`${devicePath}/transcription/poll`, pollSchema, {
          accountId: context.binding.account_id,
          body: JSON.stringify({ epoch: server.epoch, submissionId: submission.operationId }),
          method: "POST",
          signal: context.signal,
          workspaceId: context.binding.workspace_id,
        });
        if (result.state === "ready") {
          checkpoint.completed[key] = result.transcript;
          context.checkpoint(checkpoint);
          break;
        }
        if (result.state === "failed") {
          Reflect.deleteProperty(checkpoint.submissions, key);
          checkpoint.attempts[key] = (checkpoint.attempts[key] ?? 0) + 1;
          context.checkpoint(checkpoint);
          throw new MeetingTaskError("invalid", result.message);
        }
        await delay(5000, undefined, { signal: context.signal });
      }
      context.signal.throwIfAborted();
    }
    const merged = mergeMeetingTranscriptionChunkResults(
      media.chunks.map((chunk) => {
        const transcript = checkpoint.completed[`${chunk.track}:${chunk.index}`];
        if (!transcript) {
          throw new MeetingTaskError("invalid", "转写分段尚未完整保存");
        }
        return { chunk, transcript };
      }),
    );
    return echoTranscriptSchema.parse({
      ...merged,
      revisionId,
      ...server.transcription,
      turns: merged.turns.map((turn, index) => ({ ...turn, id: `${revisionId}:${index}` })),
    });
  };
}
