import type { GetObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { z } from "zod";

function parseBooleanEnv(name: string, value: string): boolean {
  if (value === "1" || value === "true" || value === "yes") {
    return true;
  }
  if (value === "0" || value === "false" || value === "no") {
    return false;
  }
  throw new Error(`${name} must be one of: 1, true, yes, 0, false, no.`);
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function getRequiredBooleanEnv(name: string): boolean {
  return parseBooleanEnv(name, getRequiredEnv(name).toLowerCase());
}

function getBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value ? parseBooleanEnv(name, value) : defaultValue;
}

interface S3Config {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  forcePathStyle: boolean;
  keyPrefix: string;
  region: string;
  secretAccessKey: string;
}

/**
 * 对象存储 endpoint 必须是不带 bucket 路径的 origin；bucket 由 Bucket 参数指定。
 * 若配置误带了 `/bucket` 路径（如 `...r2.cloudflarestorage.com/ai-interview`），
 * SDK 会拼出重复 bucket 路径导致 SigV4 签名不匹配（403 SignatureDoesNotMatch）。
 * Storage endpoints must be bare origins; the bucket is supplied by the Bucket
 * parameter. A trailing `/bucket` path duplicates the bucket and breaks SigV4.
 */
function normalizeStorageEndpoint(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error("Storage endpoint is not a valid URL");
  }
}

function readConfig(): S3Config {
  const bucket = process.env.S3_BUCKET_NAME;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const endpoint = normalizeStorageEndpoint(process.env.S3_ENDPOINT?.trim());
  const region = getRequiredEnv("S3_REGION");

  if (!(bucket && accessKeyId && secretAccessKey && endpoint)) {
    throw new Error(
      "S3 storage is not configured. Set S3_BUCKET_NAME, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT.",
    );
  }

  return {
    accessKeyId,
    bucket,
    endpoint,
    forcePathStyle: getBooleanEnv("S3_FORCE_PATH_STYLE", false),
    keyPrefix: getRequiredEnv("S3_KEY_PREFIX"),
    region,
    secretAccessKey,
  };
}

function readRecordingConfig(): S3Config {
  const bucket = process.env.RECORDING_R2_BUCKET_NAME;
  const accessKeyId = process.env.RECORDING_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.RECORDING_R2_SECRET_ACCESS_KEY;
  const endpoint = normalizeStorageEndpoint(process.env.RECORDING_R2_ENDPOINT?.trim());
  const region = getRequiredEnv("RECORDING_R2_REGION");

  if (!(bucket && accessKeyId && secretAccessKey && endpoint)) {
    throw new Error(
      "Recording R2 storage is not configured. Set RECORDING_R2_BUCKET_NAME, RECORDING_R2_ACCESS_KEY_ID, RECORDING_R2_SECRET_ACCESS_KEY, RECORDING_R2_ENDPOINT.",
    );
  }

  return {
    accessKeyId,
    bucket,
    endpoint,
    forcePathStyle: getRequiredBooleanEnv("RECORDING_R2_FORCE_PATH_STYLE"),
    keyPrefix: getRequiredEnv("RECORDING_R2_KEY_PREFIX"),
    region,
    secretAccessKey,
  };
}

export function isRecordingStorageConfigured(): boolean {
  return Boolean(
    process.env.RECORDING_R2_BUCKET_NAME &&
    process.env.RECORDING_R2_ACCESS_KEY_ID &&
    process.env.RECORDING_R2_SECRET_ACCESS_KEY &&
    process.env.RECORDING_R2_ENDPOINT,
  );
}

let cached: Promise<{ client: S3Client; config: S3Config }> | undefined;

async function buildClient() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const config = readConfig();
  const client = new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    region: config.region,
    // AWS SDK v3 defaults send x-amz-checksum-* + x-amz-sdk-checksum-algorithm
    // headers on PUT, which trigger CORS preflight on presigned URLs used from
    // the browser. R2 / Tencent COS do not require these, so skip them.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return { client, config };
}

let recordingCached: Promise<{ client: S3Client; config: S3Config }> | undefined;
const MEETING_RECORDING_CLEANUP_TIMEOUT_MS = 30_000;
const MEETING_RECORDING_WRITE_TIMEOUT_MS = 10 * 60 * 1000;

function getRecordingClient() {
  recordingCached ??= (async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const config = readRecordingConfig();
    const client = new S3Client({
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      region: config.region,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    return { client, config };
  })();
  return recordingCached;
}

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
  track: "microphone" | "system";
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

export async function deleteMeetingRecordingObject(storageKey: string): Promise<void> {
  const [{ DeleteObjectCommand }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    getRecordingClient(),
  ]);
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: storageKey }), {
    abortSignal: AbortSignal.timeout(MEETING_RECORDING_CLEANUP_TIMEOUT_MS),
  });
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

export async function abortMeetingRecordingMultipartUpload(input: {
  storageKey: string;
  uploadId: string;
}): Promise<void> {
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

export async function headMeetingRecordingObject(storageKey: string): Promise<{
  checksumSha256: string | null;
  contentLength: number;
  contentType: string;
  etag: string | null;
  sha256: string | null;
} | null> {
  const [{ HeadObjectCommand }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    getRecordingClient(),
  ]);
  try {
    const result = await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, ChecksumMode: "ENABLED", Key: storageKey }),
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
}

export async function downloadMeetingRecordingObjectToFile(input: {
  filePath: string;
  storageKey: string;
}): Promise<void> {
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

function getClient() {
  cached ??= buildClient();
  return cached;
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
