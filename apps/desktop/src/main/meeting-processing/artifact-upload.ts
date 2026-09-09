import { createReadStream } from "node:fs";
import { echoArtifactUploadSchema } from "@app/shared/meeting-device-processing";
import type { echoArtifactSchema } from "@app/shared/meeting-device-processing";
import type { z } from "zod";
import { uploadMeetingObject } from "../meeting-capture/local-meeting-multipart";
import { EchoServerClient } from "./server-client";
import type { TaskContext } from "./scheduler";
import { inspectLocalAudio } from "./media";
import { MeetingTaskError } from "./task-error";

function audioFileStream(filePath: string): ReadableStream<Uint8Array> {
  const source = createReadStream(filePath);
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    cancel() {
      source.destroy();
    },
    async pull(controller) {
      const chunk = await iterator.next();
      if (chunk.done) {
        controller.close();
        return;
      }
      if (!Buffer.isBuffer(chunk.value)) {
        throw new TypeError("音频流返回了非字节内容");
      }
      controller.enqueue(chunk.value);
    },
  });
}

export function createEchoArtifactUploader(client: EchoServerClient, allowedOrigin: string) {
  return async (
    context: TaskContext,
    epoch: number,
    filePath: string,
    artifact: z.infer<typeof echoArtifactSchema>,
  ) => {
    const actual = await inspectLocalAudio(filePath, artifact.durationMs);
    if (actual.sha256 !== artifact.sha256 || actual.sizeBytes !== artifact.sizeBytes) {
      throw new MeetingTaskError("invalid", "本地产物完整性校验失败");
    }
    const upload = await client.request(
      `${EchoServerClient.meetingsPath(context.binding)}/${encodeURIComponent(context.task.meeting_id)}/device/artifacts`,
      echoArtifactUploadSchema,
      {
        accountId: context.binding.account_id,
        body: JSON.stringify({ artifact, epoch }),
        method: "POST",
        signal: context.signal,
        workspaceId: context.binding.workspace_id,
      },
    );
    const url = new URL(upload.url);
    if (url.origin !== allowedOrigin || url.protocol !== "https:" || url.username || url.password) {
      throw new MeetingTaskError("invalid", "音频产物上传地址不属于录音存储");
    }
    const headers = {
      "content-type": artifact.contentType,
      "x-amz-checksum-sha256": Buffer.from(artifact.sha256, "hex").toString("base64"),
      "x-amz-meta-sha256": artifact.sha256,
    };
    if (Object.entries(headers).some(([name, value]) => upload.headers[name] !== value)) {
      throw new MeetingTaskError("invalid", "音频产物上传校验头不匹配");
    }
    await uploadMeetingObject({
      createBody: () => audioFileStream(filePath),
      headers,
      maxAttempts: 1,
      signal: context.signal,
      sizeBytes: artifact.sizeBytes,
      url: upload.url,
    });
  };
}
