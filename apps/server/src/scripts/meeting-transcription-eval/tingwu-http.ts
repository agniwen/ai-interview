import { createHash, createHmac, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { JsonValue } from "@app/db-schema/json";
import {
  MeetingProviderQuotaError,
  MeetingProviderResponseError,
} from "../../server/routes/meetings/transcription/provider";

const createTaskResponseSchema = z.object({
  Code: z.union([z.literal(0), z.literal("0")]),
  Data: z.object({ TaskId: z.string().min(1) }),
});

const taskInfoResponseSchema = z.object({
  Code: z.union([z.literal(0), z.literal("0")]),
  Data: z.object({
    Result: z.object({ Transcription: z.string().url().optional() }).optional(),
    TaskStatus: z.string().min(1),
  }),
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function encode(value: string): string {
  return encodeURIComponent(value).replaceAll(
    /[!'()*]/g,
    (character) => `%${character.codePointAt(0)?.toString(16).toUpperCase() ?? "00"}`,
  );
}

function canonicalQuery(url: URL): string {
  return [...url.searchParams.entries()]
    .map(([key, value]) => [encode(key), encode(value)] as const)
    .toSorted(
      ([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function signAlibabaCloudRequest(input: {
  accessKeyId: string;
  accessKeySecret: string;
  action: string;
  body: string;
  date: string;
  method: string;
  nonce: string;
  url: URL;
  version: string;
}): Headers {
  const contentHash = sha256(input.body);
  const signedHeaders =
    "host;x-acs-action;x-acs-content-sha256;x-acs-date;x-acs-signature-nonce;x-acs-version";
  const canonicalHeaders = [
    `host:${input.url.host}`,
    `x-acs-action:${input.action}`,
    `x-acs-content-sha256:${contentHash}`,
    `x-acs-date:${input.date}`,
    `x-acs-signature-nonce:${input.nonce}`,
    `x-acs-version:${input.version}`,
  ].join("\n");
  const canonicalRequest = [
    input.method,
    input.url.pathname,
    canonicalQuery(input.url),
    `${canonicalHeaders}\n`,
    signedHeaders,
    contentHash,
  ].join("\n");
  const stringToSign = `ACS3-HMAC-SHA256\n${sha256(canonicalRequest)}`;
  const signature = createHmac("sha256", input.accessKeySecret).update(stringToSign).digest("hex");
  return new Headers({
    Authorization: `ACS3-HMAC-SHA256 Credential=${input.accessKeyId},SignedHeaders=${signedHeaders},Signature=${signature}`,
    "Content-Type": "application/json",
    "x-acs-action": input.action,
    "x-acs-content-sha256": contentHash,
    "x-acs-date": input.date,
    "x-acs-signature-nonce": input.nonce,
    "x-acs-version": input.version,
  });
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return delay(milliseconds, undefined, { signal });
}

export function createTingwuHttpClient(input: {
  accessKeyId: string;
  accessKeySecret: string;
  appKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  onTaskCreated?: (taskId: string) => Promise<void> | void;
  pollIntervalMs?: number;
}) {
  const fetch = input.fetch ?? globalThis.fetch;
  const baseUrl = input.baseUrl?.replace(/\/$/, "") || "https://tingwu.cn-beijing.aliyuncs.com";
  const request = async (requestInput: {
    action: string;
    body?: unknown;
    method: "GET" | "PUT";
    path: string;
    signal: AbortSignal;
  }): Promise<JsonValue> => {
    const body = requestInput.body === undefined ? "" : JSON.stringify(requestInput.body);
    const url = new URL(requestInput.path, baseUrl);
    const headers = signAlibabaCloudRequest({
      accessKeyId: input.accessKeyId,
      accessKeySecret: input.accessKeySecret,
      action: requestInput.action,
      body,
      date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      method: requestInput.method,
      nonce: randomUUID(),
      url,
      version: "2023-09-30",
    });
    const response = await fetch(url, {
      body: body || undefined,
      headers,
      method: requestInput.method,
      signal: requestInput.signal,
    });
    if (response.status === 429) {
      throw new MeetingProviderQuotaError();
    }
    if (!response.ok) {
      throw new Error(`Tingwu request failed with HTTP ${response.status}`);
    }
    return z.json().parse(await response.json());
  };
  return {
    async createTask(task: {
      audioUrl: string;
      language: string;
      model: string;
      signal: AbortSignal;
      taskKey: string;
    }) {
      const response = createTaskResponseSchema.safeParse(
        await request({
          action: "CreateTask",
          body: {
            AppKey: input.appKey,
            Input: {
              FileUrl: task.audioUrl,
              SourceLanguage: task.language,
              TaskKey: task.taskKey,
            },
            Parameters: {
              Transcription: { DiarizationEnabled: true, OutputLevel: 2 },
            },
          },
          method: "PUT",
          path: "/openapi/tingwu/v2/tasks?type=offline",
          signal: task.signal,
        }),
      );
      if (!response.success) {
        throw new MeetingProviderResponseError("malformed-response", "Tingwu");
      }
      await input.onTaskCreated?.(response.data.Data.TaskId);
      return { taskId: response.data.Data.TaskId };
    },
    async fetchResult(url: string, signal: AbortSignal) {
      const response = await fetch(url, { signal });
      if (response.status === 429) {
        throw new MeetingProviderQuotaError();
      }
      if (!response.ok) {
        throw new Error(`Tingwu result fetch failed with HTTP ${response.status}`);
      }
      return response.json();
    },
    async pollTask(taskId: string, signal: AbortSignal) {
      while (!signal.aborted) {
        const response = taskInfoResponseSchema.safeParse(
          await request({
            action: "GetTaskInfo",
            method: "GET",
            path: `/openapi/tingwu/v2/tasks/${encodeURIComponent(taskId)}`,
            signal,
          }),
        );
        if (!response.success) {
          throw new MeetingProviderResponseError("malformed-response", "Tingwu");
        }
        const status = response.data.Data.TaskStatus;
        if (["COMPLETED", "FAILED", "INVALID"].includes(status)) {
          return {
            resultUrl: response.data.Data.Result?.Transcription,
            status,
          };
        }
        await abortableDelay(input.pollIntervalMs ?? 60_000, signal);
      }
      throw signal.reason;
    },
  };
}
