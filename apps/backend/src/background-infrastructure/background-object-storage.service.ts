import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface StorageConfiguration {
  bucket: string;
  client: S3Client;
  keyPrefix: string;
}

export interface BackgroundObjectStorageConfiguration {
  S3_ACCESS_KEY_ID?: string;
  S3_BUCKET_NAME?: string;
  S3_ENDPOINT?: string;
  S3_FORCE_PATH_STYLE?: boolean;
  S3_KEY_PREFIX?: string;
  S3_REGION?: string;
  S3_SECRET_ACCESS_KEY?: string;
}

type BackgroundObjectStorageStringKey = Exclude<
  keyof BackgroundObjectStorageConfiguration,
  "S3_FORCE_PATH_STYLE"
>;

function required(
  config: BackgroundObjectStorageConfiguration,
  name: BackgroundObjectStorageStringKey,
): string {
  const value = config[name]?.trim();
  if (!value) {
    throw new Error(`Background object storage is not configured: ${name} is required`);
  }
  return value;
}

export class BackgroundObjectStorageService {
  private configuration?: StorageConfiguration;

  constructor(private readonly environment: BackgroundObjectStorageConfiguration) {}

  private get config(): StorageConfiguration {
    this.configuration ??= {
      bucket: required(this.environment, "S3_BUCKET_NAME"),
      client: new S3Client({
        credentials: {
          accessKeyId: required(this.environment, "S3_ACCESS_KEY_ID"),
          secretAccessKey: required(this.environment, "S3_SECRET_ACCESS_KEY"),
        },
        endpoint: required(this.environment, "S3_ENDPOINT"),
        forcePathStyle: this.environment.S3_FORCE_PATH_STYLE ?? false,
        region: required(this.environment, "S3_REGION"),
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      }),
      keyPrefix: this.environment.S3_KEY_PREFIX?.replaceAll(/^\/+|\/+$/g, "") ?? "",
    };
    return this.configuration;
  }

  private key(value: string): string {
    return this.config.keyPrefix ? `${this.config.keyPrefix}/${value}` : value;
  }

  buildAttachmentKeyByHash(hash: string, extension: string): Promise<string> {
    const safeExtension = extension.replaceAll(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
    return Promise.resolve(this.key(`chat-attachments/${hash}.${safeExtension}`));
  }

  buildPlaybackStorageKey(input: {
    meetingId: string;
    organizationId: string;
    processingRunId: string;
  }): Promise<string> {
    return Promise.resolve(
      this.key(
        `meetings/${encodeURIComponent(input.organizationId)}/${encodeURIComponent(input.meetingId)}/playback/${encodeURIComponent(input.processingRunId)}.webm`,
      ),
    );
  }

  buildTranscriptionStagingKey(input: {
    index: number;
    meetingId: string;
    organizationId: string;
    stagingToken: string;
    track: string;
  }): string {
    return this.key(
      `meetings/${encodeURIComponent(input.organizationId)}/${encodeURIComponent(input.meetingId)}/transcription-staging/${encodeURIComponent(input.stagingToken)}/${input.track}-${input.index}.wav`,
    );
  }

  presignGet(storageKey: string, expiresIn: number): Promise<string> {
    return getSignedUrl(
      this.config.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: storageKey }),
      { expiresIn },
    );
  }

  async putObjectBytes(input: {
    body: Uint8Array;
    contentType: string;
    storageKey: string;
  }): Promise<void> {
    await this.config.client.send(
      new PutObjectCommand({
        Body: input.body,
        Bucket: this.config.bucket,
        ContentLength: input.body.byteLength,
        ContentType: input.contentType,
        Key: input.storageKey,
      }),
    );
  }

  async downloadToFile(input: { filePath: string; storageKey: string }): Promise<void> {
    const result = await this.config.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: input.storageKey }),
    );
    if (!result.Body) {
      throw new Error("Meeting Recording 源对象没有可读取内容");
    }
    await pipeline(result.Body.transformToWebStream(), createWriteStream(input.filePath));
  }

  async getObjectBytes(storageKey: string): Promise<{
    bytes: Uint8Array;
    contentType: string;
  } | null> {
    try {
      const result = await this.config.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: storageKey }),
      );
      if (!result.Body) {
        return null;
      }
      return {
        bytes: await result.Body.transformToByteArray(),
        contentType: result.ContentType || "application/octet-stream",
      };
    } catch (error) {
      if (error instanceof Error && ["NoSuchKey", "NotFound"].includes(error.name)) {
        return null;
      }
      throw error;
    }
  }

  async putFile(input: {
    contentType: string;
    deadlineAt: Date;
    filePath: string;
    sha256: string;
    sizeBytes: number;
    storageKey: string;
  }): Promise<void> {
    const remainingMs = input.deadlineAt.getTime() - Date.now();
    if (remainingMs <= 0) {
      throw new Error("Meeting playback writer lease 已过期");
    }
    await this.config.client.send(
      new PutObjectCommand({
        Body: createReadStream(input.filePath),
        Bucket: this.config.bucket,
        ChecksumSHA256: Buffer.from(input.sha256, "hex").toString("base64"),
        ContentLength: input.sizeBytes,
        ContentType: input.contentType,
        Key: input.storageKey,
        Metadata: { sha256: input.sha256 },
      }),
      { abortSignal: AbortSignal.timeout(Math.min(30 * 60 * 1000, remainingMs)) },
    );
  }

  async head(storageKey: string) {
    try {
      const result = await this.config.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          ChecksumMode: "ENABLED",
          Key: storageKey,
        }),
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
      if (error instanceof Error && ["NoSuchKey", "NotFound"].includes(error.name)) {
        return null;
      }
      throw error;
    }
  }

  async verify(input: {
    contentType: string;
    sha256: string;
    sizeBytes: number;
    storageKey: string;
  }): Promise<boolean> {
    const stored = await this.head(input.storageKey);
    return Boolean(
      stored &&
      stored.contentLength === input.sizeBytes &&
      stored.contentType === input.contentType &&
      stored.sha256 === input.sha256,
    );
  }

  async delete(storageKey: string): Promise<void> {
    await this.config.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: storageKey }),
      { abortSignal: AbortSignal.timeout(30_000) },
    );
  }

  async abortMultipartUpload(input: { storageKey: string; uploadId: string }): Promise<void> {
    try {
      await this.config.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: input.storageKey,
          UploadId: input.uploadId,
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
    } catch (error) {
      if (error instanceof Error && error.name === "NoSuchUpload") {
        return;
      }
      throw error;
    }
  }
}
