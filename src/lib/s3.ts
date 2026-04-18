import type { S3Client } from "@aws-sdk/client-s3";

interface R2Config {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  keyPrefix: string;
  secretAccessKey: string;
}

function readConfig(): R2Config {
  const bucket = process.env.R2_BUCKET_NAME;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT?.trim();

  if (!(bucket && accessKeyId && secretAccessKey && endpoint)) {
    throw new Error(
      "R2 is not configured. Set R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT.",
    );
  }

  return {
    accessKeyId,
    bucket,
    endpoint,
    keyPrefix: process.env.R2_KEY_PREFIX?.trim() || "",
    secretAccessKey,
  };
}

let cached: Promise<{ client: S3Client; config: R2Config }> | undefined;

async function buildClient() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const config = readConfig();
  const client = new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: config.endpoint,
    region: "auto",
    // AWS SDK v3 defaults send x-amz-checksum-* + x-amz-sdk-checksum-algorithm
    // headers on PUT, which trigger CORS preflight on presigned URLs used from
    // the browser. R2 does not require these, so skip them.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return { client, config };
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
