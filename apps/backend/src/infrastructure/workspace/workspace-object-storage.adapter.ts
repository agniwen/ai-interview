import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { Readable } from "node:stream";
import type { WorkspaceObjectStoragePort } from "../../features/workspace/workspace.ports.js";

interface StorageConfig {
  bucket: string;
  client: S3Client;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`S3 storage is not configured: ${name} is required`);
  }
  return value;
}

function createStorageConfig(): StorageConfig {
  const endpoint = new URL(required("S3_ENDPOINT")).origin;
  return {
    bucket: required("S3_BUCKET_NAME"),
    client: new S3Client({
      credentials: {
        accessKeyId: required("S3_ACCESS_KEY_ID"),
        secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
      },
      endpoint,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      region: required("S3_REGION"),
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
}

@Injectable()
export class WorkspaceObjectStorageAdapter implements WorkspaceObjectStoragePort {
  private configuration?: StorageConfig;
  private recordingConfiguration?: StorageConfig & { keyPrefix: string };

  private recording() {
    this.recordingConfiguration ??= {
      bucket: required("RECORDING_R2_BUCKET_NAME"),
      client: new S3Client({
        credentials: {
          accessKeyId: required("RECORDING_R2_ACCESS_KEY_ID"),
          secretAccessKey: required("RECORDING_R2_SECRET_ACCESS_KEY"),
        },
        endpoint: new URL(required("RECORDING_R2_ENDPOINT")).origin,
        forcePathStyle: process.env.RECORDING_R2_FORCE_PATH_STYLE === "true",
        region: required("RECORDING_R2_REGION"),
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      }),
      keyPrefix: process.env.RECORDING_R2_KEY_PREFIX?.trim() ?? "",
    };
    return this.recordingConfiguration;
  }

  async getBytes(key: string) {
    this.configuration ??= createStorageConfig();
    try {
      const result = await this.configuration.client.send(
        new GetObjectCommand({ Bucket: this.configuration.bucket, Key: key }),
      );
      if (!result.Body) {
        return null;
      }
      return {
        bytes: await result.Body.transformToByteArray(),
        contentType: result.ContentType,
      };
    } catch (error) {
      if (error instanceof Error && ["NoSuchKey", "NotFound"].includes(error.name)) {
        return null;
      }
      throw error;
    }
  }

  async getStream(key: string) {
    this.configuration ??= createStorageConfig();
    try {
      const result = await this.configuration.client.send(
        new GetObjectCommand({ Bucket: this.configuration.bucket, Key: key }),
      );
      if (!result.Body) {
        return null;
      }
      if (!(result.Body instanceof Readable)) {
        throw new Error("S3 GetObject returned a non-streaming response body");
      }
      return {
        body: result.Body,
        contentLength: result.ContentLength,
        contentType: result.ContentType,
      };
    } catch (error) {
      if (error instanceof Error && ["NoSuchKey", "NotFound"].includes(error.name)) {
        return null;
      }
      throw error;
    }
  }

  presignGet(key: string, expiresInSeconds: number): Promise<string> {
    this.configuration ??= createStorageConfig();
    return getSignedUrl(
      this.configuration.client,
      new GetObjectCommand({ Bucket: this.configuration.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  buildMeetingRecordingKey(input: {
    meetingId: string;
    organizationId: string;
    track: "microphone" | "system";
  }): Promise<string> {
    const config = this.recording();
    const prefix = config.keyPrefix ? `${config.keyPrefix.replace(/\/+$/, "")}/` : "";
    return Promise.resolve(
      `${prefix}meetings/${encodeURIComponent(input.organizationId)}/${encodeURIComponent(input.meetingId)}/${input.track}.webm`.replace(
        /^\/+/,
        "",
      ),
    );
  }

  async presignMeetingPut(input: {
    contentType: string;
    key: string;
    sha256: string;
    sizeBytes: number;
  }) {
    const config = this.recording();
    const expiresIn = 300;
    const checksum = Buffer.from(input.sha256, "hex").toString("base64");
    const headers = {
      "content-type": input.contentType,
      "x-amz-checksum-sha256": checksum,
      "x-amz-meta-sha256": input.sha256,
    };
    const url = await getSignedUrl(
      config.client,
      new PutObjectCommand({
        Bucket: config.bucket,
        ChecksumSHA256: checksum,
        ContentLength: input.sizeBytes,
        ContentType: input.contentType,
        Key: input.key,
        Metadata: { sha256: input.sha256 },
      }),
      { expiresIn, unhoistableHeaders: new Set(["x-amz-checksum-sha256", "x-amz-meta-sha256"]) },
    );
    return { expiresAt: new Date(Date.now() + expiresIn * 1000), headers, url };
  }

  presignMeetingGet(key: string, expiresInSeconds: number) {
    const config = this.recording();
    return getSignedUrl(config.client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async createMeetingMultipart(input: { contentType: string; key: string; sha256: string }) {
    const config = this.recording();
    const result = await config.client.send(
      new CreateMultipartUploadCommand({
        Bucket: config.bucket,
        ContentType: input.contentType,
        Key: input.key,
        Metadata: { sha256: input.sha256 },
      }),
    );
    if (!result.UploadId) {
      throw new Error("Recording R2 未返回 multipart upload id");
    }
    return result.UploadId;
  }

  async abortMeetingMultipart(input: { key: string; uploadId: string }) {
    const config = this.recording();
    try {
      await config.client.send(
        new AbortMultipartUploadCommand({
          Bucket: config.bucket,
          Key: input.key,
          UploadId: input.uploadId,
        }),
      );
    } catch (error) {
      if (!(error instanceof Error && error.name === "NoSuchUpload")) {
        throw error;
      }
    }
  }

  async listMeetingMultipartParts(input: { key: string; uploadId: string }) {
    const config = this.recording();
    const parts: { etag: string; partNumber: number; sizeBytes: number }[] = [];
    let marker: string | undefined;
    do {
      const result = await config.client.send(
        new ListPartsCommand({
          Bucket: config.bucket,
          Key: input.key,
          PartNumberMarker: marker,
          UploadId: input.uploadId,
        }),
      );
      for (const part of result.Parts ?? []) {
        if (part.ETag !== undefined && part.PartNumber !== undefined && part.Size !== undefined) {
          parts.push({ etag: part.ETag, partNumber: part.PartNumber, sizeBytes: part.Size });
        }
      }
      marker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
    } while (marker);
    return parts;
  }

  async presignMeetingPart(input: {
    key: string;
    md5Base64: string;
    partNumber: number;
    sizeBytes: number;
    uploadId: string;
  }) {
    const config = this.recording();
    const expiresIn = 3600;
    const url = await getSignedUrl(
      config.client,
      new UploadPartCommand({
        Bucket: config.bucket,
        ContentLength: input.sizeBytes,
        ContentMD5: input.md5Base64,
        Key: input.key,
        PartNumber: input.partNumber,
        UploadId: input.uploadId,
      }),
      { expiresIn, unhoistableHeaders: new Set(["content-md5"]) },
    );
    return {
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      headers: { "content-md5": input.md5Base64 },
      url,
    };
  }

  async completeMeetingMultipart(input: {
    key: string;
    parts: { etag: string; partNumber: number }[];
    uploadId: string;
  }) {
    const config = this.recording();
    await config.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: config.bucket,
        Key: input.key,
        MultipartUpload: {
          Parts: input.parts.map((part) => ({ ETag: part.etag, PartNumber: part.partNumber })),
        },
        UploadId: input.uploadId,
      }),
    );
  }

  async headMeetingObject(key: string) {
    const config = this.recording();
    try {
      const result = await config.client.send(
        new HeadObjectCommand({ Bucket: config.bucket, ChecksumMode: "ENABLED", Key: key }),
      );
      return {
        checksumSha256: result.ChecksumSHA256 ?? null,
        contentLength: result.ContentLength ?? 0,
        contentType: result.ContentType ?? "",
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
}
