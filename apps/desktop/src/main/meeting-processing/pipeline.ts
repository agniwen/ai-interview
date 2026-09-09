import { z } from "zod";
import {
  echoArtifactSchema,
  echoDeviceContextSchema,
  echoTranscriptSchema,
} from "@app/shared/meeting-device-processing";
import type { LocalMeetingRecordingStore } from "../meeting-capture/local-meeting-recording-store";
import type { MeetingTaskStore, ProcessingStep } from "./task-store";
import type { MeetingTaskHandler, TaskContext } from "./scheduler";
import { createWorkspaceBackupHandlers } from "./workspace-backup";
import { createLocalMediaHandler, localMediaOutputSchema } from "./media";
import { createLocalTranscriptionHandler } from "./transcription";
import { createLocalIntelligenceHandler, localIntelligenceResultSchema } from "./intelligence";
import { EchoServerClient } from "./server-client";
import { createEchoArtifactUploader } from "./artifact-upload";
import { echoOperationId, readTaskOutput } from "./pipeline-output";
import { localAdoption, createEchoAdoptionHandler } from "./adoption";
import { createEchoPurgeHandler } from "./purge";
import { createEchoQuestionHandlers } from "./question";
import { createEchoRegenerationHandlers } from "./regeneration";
import { MeetingTaskError } from "./task-error";

export const ECHO_PROCESSING_STEPS: ProcessingStep[] = [
  { dependencies: [], kind: "register" },
  { dependencies: ["register"], kind: "backup" },
  { dependencies: [], kind: "media" },
  { dependencies: ["register", "media"], kind: "transcript" },
  { dependencies: ["backup", "transcript"], kind: "sync-transcript" },
  { dependencies: ["register", "transcript"], kind: "intelligence" },
  { dependencies: ["sync-transcript", "intelligence"], kind: "sync-intelligence" },
  { dependencies: ["backup", "media"], kind: "sync-playback" },
];
const synchronizedRevisionSchema = z.object({ revisionId: z.string() });

const devicePath = (context: TaskContext) =>
  `${EchoServerClient.meetingsPath(context.binding)}/${encodeURIComponent(context.task.meeting_id)}/device`;

export function createEchoProcessingHandlers(input: {
  tasks: MeetingTaskStore;
  recordings: LocalMeetingRecordingStore;
  client: EchoServerClient;
  artifactRoot: string;
  ffmpegBin: string;
  allowedUploadOrigin: string;
  cancelMeeting: (meetingId: string) => Promise<void>;
}) {
  const backup = createWorkspaceBackupHandlers(input.recordings, input.client, input.tasks);
  const upload = createEchoArtifactUploader(input.client, input.allowedUploadOrigin);
  const serverContext = (context: TaskContext) =>
    readTaskOutput(input.tasks, context.task.meeting_id, "register", echoDeviceContextSchema);
  return {
    ...createEchoQuestionHandlers(input),
    ...createEchoRegenerationHandlers(input),
    adopt: createEchoAdoptionHandler(input),
    backup: (context) => {
      const adopted = localAdoption(input.tasks, context.task.meeting_id);
      if (adopted?.context.sourceVerified && adopted.context.recoveryCopyDeleteAfter) {
        return Promise.resolve({
          recoveryCopyDeleteAfter: adopted.context.recoveryCopyDeleteAfter,
        });
      }
      return backup.backup(context);
    },
    intelligence: createLocalIntelligenceHandler(input.tasks, input.client),
    media: createLocalMediaHandler({
      ffmpegBin: input.ffmpegBin,
      root: input.artifactRoot,
      store: input.recordings,
      tasks: input.tasks,
    }),
    purge: createEchoPurgeHandler(input),
    register: async (context) => {
      if (!localAdoption(input.tasks, context.task.meeting_id)) {
        await backup.register(context);
      }
      const server = await input.client.request(devicePath(context), echoDeviceContextSchema, {
        accountId: context.binding.account_id,
        signal: context.signal,
        workspaceId: context.binding.workspace_id,
      });
      if (
        server.manifestSha256 !== context.task.input_revision ||
        server.deviceId !== input.client.deviceId ||
        server.accountId !== context.binding.account_id
      ) {
        throw new MeetingTaskError("authorization", "此录音需在原账号和原处理设备上继续");
      }
      return server;
    },
    "sync-intelligence": (context) => {
      const server = serverContext(context);
      if (server.intelligenceRevisionId && server.intelligence) {
        return Promise.resolve({ revisionId: server.intelligenceRevisionId });
      }
      const transcript = readTaskOutput(
        input.tasks,
        context.task.meeting_id,
        "transcript",
        echoTranscriptSchema,
      );
      const { content, generationOperationId } = readTaskOutput(
        input.tasks,
        context.task.meeting_id,
        "intelligence",
        localIntelligenceResultSchema,
      );
      return input.client.operation(
        `${devicePath(context)}/sync/intelligence`,
        synchronizedRevisionSchema,
        {
          accountId: context.binding.account_id,
          body: JSON.stringify({
            content,
            epoch: server.epoch,
            expectedIntelligenceRevisionId: server.intelligenceRevisionId,
            generationOperationId,
            operationId: echoOperationId(context.task.id),
            transcriptRevisionId: transcript.revisionId,
          }),
          signal: context.signal,
          workspaceId: context.binding.workspace_id,
        },
      );
    },
    "sync-playback": async (context) => {
      const server = serverContext(context);
      if (server.playbackReady) {
        return { verified: true };
      }
      const { playback } = readTaskOutput(
        input.tasks,
        context.task.meeting_id,
        "media",
        localMediaOutputSchema,
      );
      const artifact = echoArtifactSchema.parse({
        ...playback,
        artifactId: echoOperationId(context.task.id),
        kind: "playback",
      });
      await upload(context, server.epoch, playback.filePath, artifact);
      return input.client.request(
        `${devicePath(context)}/sync/playback`,
        z.object({ verified: z.literal(true) }),
        {
          accountId: context.binding.account_id,
          body: JSON.stringify({ artifact, epoch: server.epoch }),
          method: "POST",
          signal: context.signal,
          workspaceId: context.binding.workspace_id,
        },
      );
    },
    "sync-transcript": (context) => {
      const server = serverContext(context);
      if (server.transcript) {
        return Promise.resolve({ revisionId: server.transcript.revisionId });
      }
      const transcript = readTaskOutput(
        input.tasks,
        context.task.meeting_id,
        "transcript",
        echoTranscriptSchema,
      );
      return input.client.operation(
        `${devicePath(context)}/sync/transcript`,
        synchronizedRevisionSchema,
        {
          accountId: context.binding.account_id,
          body: JSON.stringify({
            epoch: server.epoch,
            expectedTranscriptRevisionId: null,
            operationId: echoOperationId(context.task.id),
            transcript,
          }),
          signal: context.signal,
          workspaceId: context.binding.workspace_id,
        },
      );
    },
    transcript: createLocalTranscriptionHandler(input),
  } satisfies Record<string, MeetingTaskHandler>;
}
