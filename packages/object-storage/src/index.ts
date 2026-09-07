import { getClient, getRecordingClient } from "./clients";
import type { GetObjectCommandInput } from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { Data, Effect } from "effect";

export { isRecordingStorageConfigured } from "./clients";

export class ObjectStorageFailure extends Data.TaggedError("ObjectStorageFailure")<{
  readonly cause: unknown;
  readonly operation: "abort-multipart" | "delete" | "download" | "head";
}> {}

function storageEffect<A>(
  operation: ObjectStorageFailure["operation"],
  evaluate: () => Promise<A>,
) {
  return Effect.tryPromise({
    catch: (cause) => new ObjectStorageFailure({ cause, operation }),
    try: evaluate,
  });
}

function runStorageEffect<A>(effect: Effect.Effect<A, ObjectStorageFailure>): Promise<A> {
  return Effect.runPromise(
    effect.pipe(Effect.catchTag("ObjectStorageFailure", (failure) => Effect.fail(failure.cause))),
  );
}

const MEETING_RECORDING_CLEANUP_TIMEOUT_MS = 30_000;
const MEETING_RECORDING_WRITE_TIMEOUT_MS = 10 * 60 * 1000;

export async function buildRecordingFileKey(input: {
  interviewRecordId: string;
  roomName: string;
  roundId: string;
}): Promise<string> {
  const { config } = await getRecordingClient();
  const prefix = config.keyPrefix ? `${config.keyPrefix.replace(/\/+$/, "")}/` : "";
  return `${prefix}interviews/${input.interviewRecordId}/${input.roundId}/${input.roomName}.mp4`.replace(
    /^\/+/,
    "",
  );
}

export async function buildHumanInterviewRecordingFileKey(input: {
  meetingId: string;
  organizationId: string;
}): Promise<string> {
  const { config } = await getRecordingClient();
  const prefix = config.keyPrefix ? `${config.keyPrefix.replace(/\/+$/, "")}/` : "";
  const organizationId = encodeURIComponent(input.organizationId);
  const meetingId = encodeURIComponent(input.meetingId);
  return `${prefix}human-interviews/${organizationId}/${meetingId}/room-audio.ogg`.replace(
    /^\/+/,
    "",
  );
}

export async function buildHumanInterviewCandidateRecordingFileKey(input: {
  meetingId: string;
  organizationId: string;
}): Promise<string> {
  const roomFileKey = await buildHumanInterviewRecordingFileKey(input);
  return roomFileKey.replace(/room-audio\.ogg$/u, "candidate-audio.ogg");
}

export async function getHumanInterviewRecordingUploadConfig(): Promise<{
  accessKey: string;
  bucket: string;
  endpoint: string;
  forcePathStyle: boolean;
  region: string;
  secret: string;
}> {
  const { config } = await getRecordingClient();
  return {
    accessKey: config.accessKeyId,
    bucket: config.bucket,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    region: config.region,
    secret: config.secretAccessKey,
  };
}

export async function buildMeetingRecordingAssetKey(input: {
  meetingId: string;
  organizationId: string;
  track: "microphone" | "system";
}): Promise<string> {
  const { config } = await getRecordingClient();
  const prefix = config.keyPrefix ? `${config.keyPrefix.replace(/\/+$/, "")}/` : "";
  const organizationId = encodeURIComponent(input.organizationId);
  const meetingId = encodeURIComponent(input.meetingId);
  return `${prefix}meetings/${organizationId}/${meetingId}/${input.track}.webm`.replace(/^\/+/, "");
}

export async function buildMeetingPlaybackAssetKey(input: {
  meetingId: string;
  organizationId: string;
  processingRunId: string;
}): Promise<string> {
  const { config } = await getRecordingClient();
  const prefix = config.keyPrefix ? `${config.keyPrefix.replace(/\/+$/, "")}/` : "";
  const organizationId = encodeURIComponent(input.organizationId);
  const meetingId = encodeURIComponent(input.meetingId);
  const processingRunId = encodeURIComponent(input.processingRunId);
  return `${prefix}meetings/${organizationId}/${meetingId}/playback/${processingRunId}.webm`.replace(
    /^\/+/,
    "",
  );
}

export async function buildMeetingTranscriptionStagingKey(input: {
  index: number;
  meetingId: string;
  organizationId: string;
  stagingToken: string;
  track: "candidate" | "microphone" | "mixed" | "system" | `participant-${string}`;
}): Promise<string> {
  const { config } = await getRecordingClient();
  const prefix = config.keyPrefix ? `${config.keyPrefix.replace(/\/+$/, "")}/` : "";
  const organizationId = encodeURIComponent(input.organizationId);
  const meetingId = encodeURIComponent(input.meetingId);
  return `${prefix}meetings/${organizationId}/${meetingId}/transcription-staging/${input.stagingToken}/${input.track}-${input.index}.wav`.replace(
    /^\/+/,
    "",
  );
}

export function deleteMeetingRecordingObjectEffect(storageKey: string) {
  return storageEffect("delete", async () => {
    const [{ DeleteObjectCommand }, { client, config }] = await Promise.all([
      import("@aws-sdk/client-s3"),
      getRecordingClient(),
    ]);
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: storageKey }), {
      abortSignal: AbortSignal.timeout(MEETING_RECORDING_CLEANUP_TIMEOUT_MS),
    });
  });
}

export function deleteMeetingRecordingObject(storageKey: string): Promise<void> {
  return runStorageEffect(deleteMeetingRecordingObjectEffect(storageKey));
}

function isNoSuchKey(error: Error): boolean {
  return error.name === "NoSuchKey";
}

export async function presignMeetingRecordingPutObject(input: {
  contentType: string;
  sha256: string;
  sizeBytes: number;
  storageKey: string;
  expiresInSeconds?: number;
}): Promise<{ expiresAt: Date; headers: Record<string, string>; url: string }> {
  const expiresInSeconds = input.expiresInSeconds ?? 300;
  const [{ PutObjectCommand }, { getSignedUrl }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@aws-sdk/s3-request-presigner"),
    getRecordingClient(),
  ]);
  const headers = {
    "content-type": input.contentType,
    "x-amz-checksum-sha256": Buffer.from(input.sha256, "hex").toString("base64"),
    "x-amz-meta-sha256": input.sha256,
  };
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      ChecksumSHA256: headers["x-amz-checksum-sha256"],
      ContentLength: input.sizeBytes,
      ContentType: input.contentType,
      Key: input.storageKey,
      Metadata: { sha256: input.sha256 },
    }),
    {
      expiresIn: expiresInSeconds,
      // S3RequestPresigner 默认把 x-amz-* header 提升为 query 参数；R2 只认
      // header 形式的 metadata/checksum，必须强制它们留在 header 并进签名。
      // The presigner hoists x-amz-* headers into query params by default; R2
      // only honors metadata/checksums sent as signed headers.
      unhoistableHeaders: new Set(["x-amz-checksum-sha256", "x-amz-meta-sha256"]),
    },
  );
  return { expiresAt: new Date(Date.now() + expiresInSeconds * 1000), headers, url };
}

export async function createMeetingRecordingMultipartUpload(input: {
  contentType: string;
  sha256: string;
  storageKey: string;
}): Promise<string> {
  const [{ CreateMultipartUploadCommand }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    getRecordingClient(),
  ]);
  const result = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: config.bucket,
      ContentType: input.contentType,
      Key: input.storageKey,
      Metadata: { sha256: input.sha256 },
    }),
    { abortSignal: AbortSignal.timeout(MEETING_RECORDING_CLEANUP_TIMEOUT_MS) },
  );
  if (!result.UploadId) {
    throw new Error("Recording R2 未返回 multipart upload id");
  }
  return result.UploadId;
}

export function abortMeetingRecordingMultipartUploadEffect(input: {
  storageKey: string;
  uploadId: string;
}) {
  return storageEffect("abort-multipart", async () => {
    const [{ AbortMultipartUploadCommand }, { client, config }] = await Promise.all([
      import("@aws-sdk/client-s3"),
      getRecordingClient(),
    ]);
    try {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: config.bucket,
          Key: input.storageKey,
          UploadId: input.uploadId,
        }),
        { abortSignal: AbortSignal.timeout(MEETING_RECORDING_CLEANUP_TIMEOUT_MS) },
      );
    } catch (error) {
      const uploadError = error instanceof Error ? error : new Error(String(error));
      if (uploadError.name === "NoSuchUpload") {
        return;
      }
      throw error;
    }
  });
}

export function abortMeetingRecordingMultipartUpload(input: {
  storageKey: string;
  uploadId: string;
}): Promise<void> {
  return runStorageEffect(abortMeetingRecordingMultipartUploadEffect(input));
}

export async function listMeetingRecordingUploadParts(input: {
  storageKey: string;
  uploadId: string;
}): Promise<{ etag: string; partNumber: number; sizeBytes: number }[]> {
  const [{ ListPartsCommand }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    getRecordingClient(),
  ]);
  const parts: { etag: string; partNumber: number; sizeBytes: number }[] = [];
  let partNumberMarker: string | undefined;
  do {
    const result = await client.send(
      new ListPartsCommand({
        Bucket: config.bucket,
        Key: input.storageKey,
        PartNumberMarker: partNumberMarker,
        UploadId: input.uploadId,
      }),
      { abortSignal: AbortSignal.timeout(MEETING_RECORDING_CLEANUP_TIMEOUT_MS) },
    );
    for (const part of result.Parts ?? []) {
      if (part.ETag !== undefined && part.PartNumber !== undefined && part.Size !== undefined) {
        parts.push({ etag: part.ETag, partNumber: part.PartNumber, sizeBytes: part.Size });
      }
    }
    partNumberMarker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
  } while (partNumberMarker);
  return parts;
}

export async function presignMeetingRecordingUploadPart(input: {
  md5Base64: string;
  partNumber: number;
  sizeBytes: number;
  storageKey: string;
  uploadId: string;
  expiresInSeconds?: number;
}): Promise<{ expiresAt: Date; headers: Record<string, string>; url: string }> {
  const expiresInSeconds = input.expiresInSeconds ?? 3600;
  const [{ UploadPartCommand }, { getSignedUrl }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@aws-sdk/s3-request-presigner"),
    getRecordingClient(),
  ]);
  const url = await getSignedUrl(
    client,
    new UploadPartCommand({
      Bucket: config.bucket,
      ContentLength: input.sizeBytes,
      ContentMD5: input.md5Base64,
      Key: input.storageKey,
      PartNumber: input.partNumber,
      UploadId: input.uploadId,
    }),
    {
      expiresIn: expiresInSeconds,
      // 同 PutObject：content-md5 必须作为已签名 header 发送，R2 才校验分片完整性。
      unhoistableHeaders: new Set(["content-md5"]),
    },
  );
  return {
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    headers: { "content-md5": input.md5Base64 },
    url,
  };
}

export async function completeMeetingRecordingMultipartUpload(input: {
  parts: { etag: string; partNumber: number }[];
  storageKey: string;
  uploadId: string;
}): Promise<void> {
  const [{ CompleteMultipartUploadCommand }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    getRecordingClient(),
  ]);
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: config.bucket,
      Key: input.storageKey,
      MultipartUpload: {
        Parts: input.parts.map((part) => ({ ETag: part.etag, PartNumber: part.partNumber })),
      },
      UploadId: input.uploadId,
    }),
    { abortSignal: AbortSignal.timeout(MEETING_RECORDING_WRITE_TIMEOUT_MS) },
  );
}

export function headMeetingRecordingObjectEffect(storageKey: string) {
  return storageEffect(
    "head",
    async (): Promise<{
      checksumSha256: string | null;
      contentLength: number;
      contentType: string;
      etag: string | null;
      sha256: string | null;
    } | null> => {
      const [{ HeadObjectCommand }, { client, config }] = await Promise.all([
        import("@aws-sdk/client-s3"),
        getRecordingClient(),
      ]);
      try {
        const result = await client.send(
          new HeadObjectCommand({
            Bucket: config.bucket,
            ChecksumMode: "ENABLED",
            Key: storageKey,
          }),
          { abortSignal: AbortSignal.timeout(MEETING_RECORDING_CLEANUP_TIMEOUT_MS) },
        );
        if (result.ContentLength === undefined || !result.ContentType) {
          return null;
        }
        return {
          checksumSha256: result.ChecksumSHA256 ?? null,
          contentLength: result.ContentLength,
          contentType: result.ContentType,
          etag: result.ETag ?? null,
          sha256: result.Metadata?.sha256 ?? null,
        };
      } catch (error) {
        const headError = error instanceof Error ? error : new Error(String(error));
        const parsedMetadata = z
          .object({ $metadata: z.object({ httpStatusCode: z.number().optional() }).optional() })
          .safeParse(error);
        if (
          isNoSuchKey(headError) ||
          (parsedMetadata.success && parsedMetadata.data.$metadata?.httpStatusCode === 404)
        ) {
          return null;
        }
        throw error;
      }
    },
  );
}

export function headMeetingRecordingObject(storageKey: string): Promise<{
  checksumSha256: string | null;
  contentLength: number;
  contentType: string;
  etag: string | null;
  sha256: string | null;
} | null> {
  return runStorageEffect(headMeetingRecordingObjectEffect(storageKey));
}

export function downloadMeetingRecordingObjectToFileEffect(input: {
  filePath: string;
  storageKey: string;
}) {
  return storageEffect("download", async () => {
    const [{ GetObjectCommand }, { client, config }] = await Promise.all([
      import("@aws-sdk/client-s3"),
      getRecordingClient(),
    ]);
    const response = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: input.storageKey }),
    );
    if (!response.Body) {
      throw new Error("Meeting Recording 源对象没有可读取内容");
    }
    await pipeline(response.Body.transformToWebStream(), createWriteStream(input.filePath));
  });
}

export function downloadMeetingRecordingObjectToFile(input: {
  filePath: string;
  storageKey: string;
}): Promise<void> {
  return runStorageEffect(downloadMeetingRecordingObjectToFileEffect(input));
}

interface MeetingRecordingFileInput {
  contentType: string;
  deadlineAt: Date;
  filePath: string;
  sha256: string;
  sizeBytes: number;
  storageKey: string;
}

async function prepareMeetingRecordingFileUpload(input: MeetingRecordingFileInput) {
  const [{ PutObjectCommand }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    getRecordingClient(),
  ]);
  const command = new PutObjectCommand({
    Body: createReadStream(input.filePath),
    Bucket: config.bucket,
    ChecksumSHA256: Buffer.from(input.sha256, "hex").toString("base64"),
    ContentLength: input.sizeBytes,
    ContentType: input.contentType,
    Key: input.storageKey,
    Metadata: { sha256: input.sha256 },
  });

  return {
    send: async (abortSignal: AbortSignal) => {
      await client.send(command, { abortSignal });
    },
  };
}

export async function putMeetingRecordingFile(
  input: MeetingRecordingFileInput,
  prepareUpload = prepareMeetingRecordingFileUpload,
): Promise<void> {
  const upload = await prepareUpload(input);
  const remainingMs = input.deadlineAt.getTime() - Date.now();
  if (remainingMs <= 0) {
    throw new Error("Meeting playback writer lease 已过期");
  }
  await upload.send(AbortSignal.timeout(Math.min(MEETING_RECORDING_WRITE_TIMEOUT_MS, remainingMs)));
}

export async function buildAttachmentKey(attachmentId: string, extension: string): Promise<string> {
  const { config } = await getClient();
  const safeExt = extension.replaceAll(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const prefix = config.keyPrefix ? `${config.keyPrefix.replace(/\/+$/, "")}/` : "";
  return `${prefix}chat-attachments/${attachmentId}.${safeExt}`;
}

// 基于内容哈希命名的 chat 附件 S3 key——多个 chat_attachment 行共用同一个 hash key。
// Hash-keyed S3 key for chat attachments — multiple rows can share the same key.
export async function buildAttachmentKeyByHash(hash: string, extension: string): Promise<string> {
  const { config } = await getClient();
  const safeExt = extension.replaceAll(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const prefix = config.keyPrefix ? `${config.keyPrefix.replace(/\/+$/, "")}/` : "";
  return `${prefix}chat-attachments/${hash}.${safeExt}`;
}

export async function buildInterviewResumeKey(interviewRecordId: string): Promise<string> {
  const { config } = await getClient();
  const prefix = config.keyPrefix ? `${config.keyPrefix.replace(/\/+$/, "")}/` : "";
  return `${prefix}studio-resumes/${interviewRecordId}.pdf`;
}

// 基于内容哈希命名的 studio 简历 S3 key——多条面试可指向同一对象。
// Hash-keyed S3 key for studio interview resumes — multiple records can point at the same object.
export async function buildInterviewResumeKeyByHash(hash: string): Promise<string> {
  const { config } = await getClient();
  const prefix = config.keyPrefix ? `${config.keyPrefix.replace(/\/+$/, "")}/` : "";
  return `${prefix}studio-resumes/${hash}.pdf`;
}

export async function putObjectBytes(input: {
  storageKey: string;
  contentType: string;
  body: Uint8Array;
}): Promise<void> {
  const [{ PutObjectCommand }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    getClient(),
  ]);
  await client.send(
    new PutObjectCommand({
      Body: input.body,
      Bucket: config.bucket,
      ContentLength: input.body.byteLength,
      ContentType: input.contentType,
      Key: input.storageKey,
    }),
  );
}

export async function buildRecruitingInitialInterviewObjectKey(
  organizationId: string,
  snapshotId: string,
  kind: "recording" | "resume",
): Promise<string> {
  const { config } = await (kind === "recording" ? getRecordingClient() : getClient());
  const prefix = config.keyPrefix ? `${config.keyPrefix.replace(/\/+$/, "")}/` : "";
  return `${prefix}recruiting-initial-interviews/${encodeURIComponent(organizationId)}/${encodeURIComponent(snapshotId)}/${kind}`;
}

/** The independent recruiting object is copied inside recording storage, never through Hono. */
export async function copyMeetingRecordingToRecruitingStorage(input: {
  sourceStorageKey: string;
  targetStorageKey: string;
  contentType: string;
}): Promise<{ sizeBytes: number }> {
  const [{ CopyObjectCommand, HeadObjectCommand }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    getRecordingClient(),
  ]);
  await client.send(
    new CopyObjectCommand({
      Bucket: config.bucket,
      CopySource: `${encodeURIComponent(config.bucket)}/${input.sourceStorageKey.split("/").map(encodeURIComponent).join("/")}`,
      Key: input.targetStorageKey,
    }),
  );
  const copied = await client.send(
    new HeadObjectCommand({ Bucket: config.bucket, Key: input.targetStorageKey }),
  );
  if (!copied.ContentLength) {
    throw new Error("Recruiting recording snapshot is empty");
  }
  return { sizeBytes: copied.ContentLength };
}

export async function copyRecruitingSnapshotObject(input: {
  sourceStorageKey: string;
  targetStorageKey: string;
}): Promise<void> {
  const [{ CopyObjectCommand }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    getClient(),
  ]);
  await client.send(
    new CopyObjectCommand({
      Bucket: config.bucket,
      CopySource: `${encodeURIComponent(config.bucket)}/${input.sourceStorageKey.split("/").map(encodeURIComponent).join("/")}`,
      Key: input.targetStorageKey,
    }),
  );
}

export async function deleteRecruitingSnapshotObject(storageKey: string): Promise<void> {
  const [{ DeleteObjectCommand }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    storageKey.endsWith("/recording") ? getRecordingClient() : getClient(),
  ]);
  const prefix = config.keyPrefix ? `${config.keyPrefix.replace(/\/+$/, "")}/` : "";
  if (!storageKey.startsWith(`${prefix}recruiting-initial-interviews/`)) {
    throw new Error("Not a recruiting initial interview snapshot object");
  }
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: storageKey }));
}

export interface ObjectResult {
  body: ReadableStream<Uint8Array>;
  contentLength?: number;
  contentType?: string;
}

export async function getObjectStream(storageKey: string): Promise<ObjectResult | null> {
  const [{ GetObjectCommand }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    getClient(),
  ]);
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: storageKey }),
    );
    if (!response.Body) {
      return null;
    }
    return {
      body: response.Body.transformToWebStream(),
      contentLength: response.ContentLength,
      contentType: response.ContentType,
    };
  } catch (error) {
    const downloadError = error instanceof Error ? error : new Error(String(error));
    if (isNoSuchKey(downloadError)) {
      return null;
    }
    throw error;
  }
}

// 为给定 S3 对象生成只读的预签名 URL, 主要用于浏览器直接 GET 大文件
// (例如面试录像 mp4) 而不是经由服务端转发流量.
// Generate a presigned read-only URL so the browser can GET large objects
// (e.g. interview recording mp4) directly from S3 instead of streaming
// through the Node server.
export async function presignGetObjectUrl(
  storageKey: string,
  expiresInSeconds = 600,
): Promise<string> {
  const [{ GetObjectCommand }, { getSignedUrl }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@aws-sdk/s3-request-presigner"),
    getClient(),
  ]);
  return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: storageKey }), {
    expiresIn: expiresInSeconds,
  });
}

export async function presignRecordingGetObjectUrl(
  storageKey: string,
  expiresInSeconds = 600,
  downloadFilename?: string,
): Promise<string> {
  const [{ GetObjectCommand }, { getSignedUrl }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@aws-sdk/s3-request-presigner"),
    getRecordingClient(),
  ]);
  const commandInput: GetObjectCommandInput = {
    Bucket: config.bucket,
    Key: storageKey,
  };
  if (downloadFilename) {
    commandInput.ResponseContentDisposition = `attachment; filename="meeting-recording.webm"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`;
  }
  return getSignedUrl(client, new GetObjectCommand(commandInput), { expiresIn: expiresInSeconds });
}

export async function getObjectBytes(storageKey: string): Promise<{
  bytes: Uint8Array;
  contentType: string;
} | null> {
  const [{ GetObjectCommand }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    getClient(),
  ]);
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: storageKey }),
    );
    if (!response.Body) {
      return null;
    }
    const bytes = await response.Body.transformToByteArray();
    return {
      bytes,
      contentType: response.ContentType ?? "application/octet-stream",
    };
  } catch (error) {
    const downloadError = error instanceof Error ? error : new Error(String(error));
    if (isNoSuchKey(downloadError)) {
      return null;
    }
    throw error;
  }
}
