import type { S3Client } from "@aws-sdk/client-s3";
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

export function getRecordingClient() {
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

export function getClient() {
  cached ??= buildClient();
  return cached;
}
