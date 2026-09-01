import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Injectable } from "@nestjs/common";
import { Readable } from "node:stream";

interface Configuration {
  bucket: string;
  client: S3Client;
  prefix: string;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`S3 storage is not configured: ${name} is required`);
  }
  return value;
}

@Injectable()
export class ChatStorage {
  private configuration?: Configuration;

  private get config() {
    this.configuration ??= {
      bucket: required("S3_BUCKET_NAME"),
      client: new S3Client({
        credentials: {
          accessKeyId: required("S3_ACCESS_KEY_ID"),
          secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
        },
        endpoint: new URL(required("S3_ENDPOINT")).origin,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
        region: required("S3_REGION"),
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      }),
      prefix: process.env.S3_KEY_PREFIX?.replaceAll(/^\/+|\/+$/gu, "") ?? "",
    };
    return this.configuration;
  }

  attachmentKey(hash: string, extension: string) {
    const suffix = extension.replaceAll(/[^a-z0-9]/giu, "").toLowerCase() || "bin";
    const key = `chat-attachments/${hash}.${suffix}`;
    return this.config.prefix ? `${this.config.prefix}/${key}` : key;
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    await this.config.client.send(
      new PutObjectCommand({
        Body: body,
        Bucket: this.config.bucket,
        ContentLength: body.byteLength,
        ContentType: contentType,
        Key: key,
      }),
    );
  }

  async getBytes(key: string) {
    try {
      const result = await this.config.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
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
    try {
      const result = await this.config.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      if (!(result.Body instanceof Readable)) {
        return null;
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
}
