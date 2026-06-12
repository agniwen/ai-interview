import type { S3Client } from "@aws-sdk/client-s3";
import { getRequiredBooleanEnv, getRequiredEnv } from "./env";

interface S3Config {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  forcePathStyle: boolean;
  keyPrefix: string;
  region: string;
  secretAccessKey: string;
}

function readConfig(): S3Config {
  const bucket = process.env.S3_BUCKET_NAME;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const endpoint = process.env.S3_ENDPOINT?.trim();
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
    forcePathStyle: getRequiredBooleanEnv("S3_FORCE_PATH_STYLE"),
    keyPrefix: getRequiredEnv("S3_KEY_PREFIX"),
    region,
    secretAccessKey,
  };
}

function readRecordingConfig(): S3Config {
  const bucket = process.env.RECORDING_R2_BUCKET_NAME;
  const accessKeyId = process.env.RECORDING_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.RECORDING_R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.RECORDING_R2_ENDPOINT?.trim();
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

function isNoSuchKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "NoSuchKey"
  );
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
    if (isNoSuchKey(error)) {
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
): Promise<string> {
  const [{ GetObjectCommand }, { getSignedUrl }, { client, config }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@aws-sdk/s3-request-presigner"),
    getRecordingClient(),
  ]);
  return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: storageKey }), {
    expiresIn: expiresInSeconds,
  });
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
    if (isNoSuchKey(error)) {
      return null;
    }
    throw error;
  }
}
