import { createHash } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { z } from "zod";
import { echoAdoptionSchema, echoDeviceContextSchema } from "@app/shared/meeting-device-processing";
import type { LocalMeetingRecordingStore } from "../meeting-capture/local-meeting-recording-store";
import type { MeetingTaskStore } from "./task-store";
import type { TaskContext } from "./scheduler";
import { EchoServerClient } from "./server-client";
import { MeetingTaskError } from "./task-error";

const sourceSchema = echoAdoptionSchema.shape.sources.element
  .omit({ url: true })
  .extend({ filePath: z.string() });
export const localAdoptionSchema = z.object({
  context: echoDeviceContextSchema,
  sources: sourceSchema.array(),
  useLocalCapture: z.boolean(),
});

/** A downloaded file becomes an input only after hash/size verification and fsync. */
export async function downloadVerifiedEchoSource(input: {
  source: z.infer<typeof echoAdoptionSchema>["sources"][number];
  filePath: string;
  allowedOrigin: string;
  signal: AbortSignal;
  fetcher?: typeof fetch;
}) {
  if (new URL(input.source.url).origin !== input.allowedOrigin) {
    throw new MeetingTaskError("invalid", "录音下载地址不受信任");
  }
  const response = await (input.fetcher ?? fetch)(input.source.url, {
    redirect: "error",
    signal: input.signal,
  });
  if (!response.ok || !response.body) {
    throw new MeetingTaskError("transient", "下载原始录音失败");
  }
  await mkdir(dirname(input.filePath), { mode: 0o700, recursive: true });
  const temporaryPath = `${input.filePath}.partial`;
  const file = await open(temporaryPath, "w", 0o600);
  const hash = createHash("sha256");
  let size = 0;
  try {
    for await (const chunk of response.body) {
      input.signal.throwIfAborted();
      size += chunk.byteLength;
      if (size > input.source.sizeBytes) {
        throw new MeetingTaskError("invalid", "下载音轨大小不符");
      }
      hash.update(chunk);
      await file.writeFile(chunk);
    }
    if (size !== input.source.sizeBytes || hash.digest("hex") !== input.source.sha256) {
      throw new MeetingTaskError("invalid", "下载音轨完整性校验失败");
    }
    await file.sync();
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  } finally {
    await file.close();
  }
  await rename(temporaryPath, input.filePath);
  const directory = await open(dirname(input.filePath), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export function localAdoption(tasks: MeetingTaskStore, meetingId: string) {
  const task = tasks
    .list(meetingId)
    .find((item) => item.kind === "adopt" && item.state === "succeeded");
  return task?.output ? localAdoptionSchema.parse(JSON.parse(task.output)) : null;
}

export function createEchoAdoptionHandler(input: {
  client: EchoServerClient;
  recordings: LocalMeetingRecordingStore;
  artifactRoot: string;
  allowedUploadOrigin: string;
}) {
  return async (context: TaskContext) => {
    const initial = z
      .object({ epoch: z.number().int().positive() })
      .parse(JSON.parse(context.task.checkpoint ?? "null"));
    await input.client.assertAccount(context.binding, context.signal);
    const adopted = await input.client.request(
      `${EchoServerClient.meetingsPath(context.binding)}/${encodeURIComponent(context.task.meeting_id)}/device/adopt`,
      echoAdoptionSchema,
      {
        accountId: context.binding.account_id,
        body: JSON.stringify(initial),
        method: "POST",
        signal: context.signal,
        workspaceId: context.binding.workspace_id,
      },
    );
    if (adopted.context.manifestSha256 !== context.task.input_revision) {
      throw new MeetingTaskError("invalid", "录音版本不一致");
    }
    const descriptor = await input.recordings
      .describeWorkspaceSave(context.task.meeting_id)
      .catch(() => null);
    if (descriptor?.manifestSha256 === context.task.input_revision) {
      return localAdoptionSchema.parse({ ...adopted, sources: [], useLocalCapture: true });
    }
    if (
      !adopted.context.sourceVerified ||
      adopted.sources.length !== 2 ||
      new Set(adopted.sources.map((source) => source.track)).size !== 2
    ) {
      throw new MeetingTaskError("invalid", "云端原始录音尚未完整备份，请在保留录音的原设备继续");
    }
    const sources: z.infer<typeof sourceSchema>[] = [];
    for (const source of adopted.sources) {
      const filePath = join(
        input.artifactRoot,
        context.task.meeting_id,
        context.task.input_revision,
        `${source.track}-import.webm`,
      );
      await downloadVerifiedEchoSource({
        allowedOrigin: input.allowedUploadOrigin,
        filePath,
        signal: context.signal,
        source,
      });
      sources.push(sourceSchema.parse({ ...source, filePath }));
    }
    return localAdoptionSchema.parse({ ...adopted, sources, useLocalCapture: false });
  };
}
