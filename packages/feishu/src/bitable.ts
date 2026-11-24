import { setTimeout as delay } from "node:timers/promises";
import type { JsonObject } from "@app/db-schema/json";
import { z } from "zod";
import { getFeishuTenantAccessToken } from "./access-token";
import { getFeishuAppCredentials, getPreferredFeishuProviderId } from "./provider";
import type { FeishuProviderId } from "./provider";

const FEISHU_API_ROOT = "https://open.feishu.cn/open-apis";
const FEISHU_UPLOAD_ALL_MAX_BYTES = 20 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/u;

export interface ParsedFeishuBitableWikiTarget {
  kind: "wiki";
  nodeToken: string;
  tableId: string;
}

export interface ParsedFeishuBitableBaseTarget {
  appToken: string;
  kind: "base";
  tableId: string;
}

export type ParsedFeishuBitableTarget =
  | ParsedFeishuBitableBaseTarget
  | ParsedFeishuBitableWikiTarget;

export interface FeishuBitableAttachmentValue {
  file_token: string;
  name?: string;
}

export interface FeishuBitableUrlValue {
  link: string;
  text?: string;
}

export type FeishuBitableWriteFieldValue =
  | FeishuBitableAttachmentValue[]
  | FeishuBitableUrlValue
  | number
  | string;

export type FeishuBitableWriteFields = Record<string, FeishuBitableWriteFieldValue>;

export interface FeishuBitableDependencies {
  chunkThresholdBytes?: number;
  fetcher?: typeof fetch;
  getAccessToken?: (providerId: FeishuProviderId, signal?: AbortSignal) => Promise<string>;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface CreatedFeishuBitableRecord {
  recordId: string;
}

export interface FeishuBitableRecordSnapshot {
  fields: JsonObject;
  recordId: string;
}

export class FeishuBitableApiError extends Error {
  readonly code: number;
  readonly status: number;

  constructor(code: number, status: number, message: string) {
    super(`Feishu Bitable API request failed: ${code || status} ${message}`.trim());
    this.name = "FeishuBitableApiError";
    this.code = code;
    this.status = status;
  }
}

const feishuApiResponseSchema = z.object({
  code: z.number(),
  data: z.unknown().optional(),
  msg: z.string().optional(),
});

const wikiNodeDataSchema = z.object({
  node: z.object({
    obj_token: z.string().min(1),
    obj_type: z.string().min(1),
  }),
});

const uploadAllDataSchema = z.object({
  file_token: z.string().min(1),
});

const uploadPrepareDataSchema = z.object({
  block_num: z.number().int().positive(),
  block_size: z.number().int().positive(),
  upload_id: z.string().min(1),
});

const uploadPartDataSchema = z.object({}).passthrough();

const createRecordDataSchema = z.object({
  record: z.object({
    record_id: z.string().min(1),
  }),
});

const readRecordDataSchema = z.object({
  record: z.object({
    fields: z.custom<JsonObject>((value) => Boolean(value) && !Array.isArray(value)),
    record_id: z.string().min(1),
  }),
});

const updateRecordDataSchema = z.object({
  record: z.object({
    record_id: z.string().min(1),
  }),
});

export const feishuBitableAttachmentItemSchema = z
  .object({
    file_token: z.string().min(1),
    name: z.string().optional(),
  })
  .passthrough();

export const feishuBitableUrlValueSchema = z
  .object({
    link: z.string().min(1),
    text: z.string().optional(),
  })
  .passthrough();

const wikiNodeAppTokenCache = new Map<string, string>();

function isFeishuHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === "feishu.cn" ||
    lower.endsWith(".feishu.cn") ||
    lower === "larksuite.com" ||
    lower.endsWith(".larksuite.com")
  );
}

export function parseFeishuBitableUrl(rawUrl: string): ParsedFeishuBitableTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !isFeishuHost(parsed.hostname)) {
    return null;
  }
  const tableId = parsed.searchParams.get("table")?.trim() ?? "";
  if (!tableId || !TOKEN_PATTERN.test(tableId)) {
    return null;
  }
  const [kindSegment, tokenSegment] = parsed.pathname.split("/").filter(Boolean);
  if (!tokenSegment || !TOKEN_PATTERN.test(tokenSegment)) {
    return null;
  }
  if (kindSegment === "wiki") {
    return { kind: "wiki", nodeToken: tokenSegment, tableId };
  }
  if (kindSegment === "base") {
    return { appToken: tokenSegment, kind: "base", tableId };
  }
  return null;
}

function resolveAccessToken(
  providerId: FeishuProviderId,
  dependencies?: FeishuBitableDependencies,
  signal?: AbortSignal,
): Promise<string> {
  if (dependencies?.getAccessToken) {
    return dependencies.getAccessToken(providerId, signal);
  }
  const credentials = getFeishuAppCredentials(providerId);
  return getFeishuTenantAccessToken(credentials.appId, credentials.appSecret, signal);
}

function isRetryableFeishuFailure(status: number, code: number): boolean {
  return status === 429 || status >= 500 || code === 99_991_400;
}

type FeishuBitableJsonBody = JsonObject | { fields: FeishuBitableWriteFields };

async function requestFeishuBitable<T extends z.ZodType>(
  path: string,
  responseDataSchema: T,
  options: {
    body?: FeishuBitableJsonBody | FormData;
    dependencies?: FeishuBitableDependencies;
    method: "GET" | "POST" | "PUT";
    providerId?: FeishuProviderId;
    signal?: AbortSignal;
  },
): Promise<z.output<T>> {
  const fetcher = options.dependencies?.fetcher ?? fetch;
  const sleep = options.dependencies?.sleep ?? delay;
  const providerId = options.providerId ?? getPreferredFeishuProviderId();
  const token = await resolveAccessToken(providerId, options.dependencies, options.signal);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const headers = new Headers({ authorization: `Bearer ${token}` });
    let serializedBody: BodyInit | undefined;
    if (options.body instanceof FormData) {
      serializedBody = options.body;
    } else if (options.body) {
      headers.set("content-type", "application/json; charset=utf-8");
      serializedBody = JSON.stringify(options.body);
    }

    const response = await fetcher(`${FEISHU_API_ROOT}${path}`, {
      body: serializedBody,
      headers,
      method: options.method,
      signal: options.signal,
    });
    const envelope = feishuApiResponseSchema.safeParse(await response.json());
    if (!envelope.success) {
      throw new Error("Feishu Bitable API returned an invalid JSON response");
    }
    if (response.ok && envelope.data.code === 0) {
      const data = responseDataSchema.safeParse(envelope.data.data);
      if (data.success) {
        return data.data;
      }
      throw new Error("Feishu Bitable API returned an invalid success payload");
    }

    const error = new FeishuBitableApiError(
      envelope.data.code,
      response.status,
      envelope.data.msg ?? "",
    );
    if (
      !isRetryableFeishuFailure(response.status, envelope.data.code) ||
      attempt === MAX_ATTEMPTS
    ) {
      throw error;
    }
    await sleep(500 * 2 ** (attempt - 1));
  }

  throw new Error("Feishu Bitable API request failed after retries");
}

export async function resolveFeishuBitableAppToken(
  input: {
    nodeToken: string;
    providerId?: FeishuProviderId;
    signal?: AbortSignal;
  },
  dependencies?: FeishuBitableDependencies,
): Promise<string> {
  const providerId = input.providerId ?? getPreferredFeishuProviderId();
  const cacheKey = `${providerId}:${input.nodeToken}`;
  const cached = wikiNodeAppTokenCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await requestFeishuBitable(
    `/wiki/v2/spaces/get_node?token=${encodeURIComponent(input.nodeToken)}`,
    wikiNodeDataSchema,
    {
      dependencies,
      method: "GET",
      providerId,
      signal: input.signal,
    },
  );
  if (result.node.obj_type !== "bitable") {
    throw new Error(`Wiki node ${input.nodeToken} is not a bitable (${result.node.obj_type})`);
  }
  wikiNodeAppTokenCache.set(cacheKey, result.node.obj_token);
  return result.node.obj_token;
}

export async function resolveFeishuBitableTarget(
  targetUrl: string,
  options?: { providerId?: FeishuProviderId; signal?: AbortSignal },
  dependencies?: FeishuBitableDependencies,
): Promise<{ appToken: string; tableId: string }> {
  const parsed = parseFeishuBitableUrl(targetUrl);
  if (!parsed) {
    throw new Error("无效的飞书多维表格链接。");
  }
  if (parsed.kind === "base") {
    return { appToken: parsed.appToken, tableId: parsed.tableId };
  }
  const appToken = await resolveFeishuBitableAppToken(
    {
      nodeToken: parsed.nodeToken,
      providerId: options?.providerId,
      signal: options?.signal,
    },
    dependencies,
  );
  return { appToken, tableId: parsed.tableId };
}

function toArrayBufferBlob(bytes: Uint8Array, mediaType: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: mediaType });
}

async function uploadMediaChunks(
  input: {
    appToken: string;
    bytes: Uint8Array;
    fileName: string;
    mediaType: string;
    providerId?: FeishuProviderId;
    signal?: AbortSignal;
  },
  dependencies?: FeishuBitableDependencies,
): Promise<string> {
  const prepared = await requestFeishuBitable(
    "/drive/v1/medias/upload_prepare",
    uploadPrepareDataSchema,
    {
      body: {
        file_name: input.fileName,
        parent_node: input.appToken,
        parent_type: "bitable_file",
        size: input.bytes.byteLength,
      },
      dependencies,
      method: "POST",
      providerId: input.providerId,
      signal: input.signal,
    },
  );

  for (let seq = 0; seq < prepared.block_num; seq += 1) {
    const start = seq * prepared.block_size;
    const end = Math.min(input.bytes.byteLength, start + prepared.block_size);
    const slice = input.bytes.subarray(start, end);
    const partBody = new FormData();
    partBody.append("upload_id", prepared.upload_id);
    partBody.append("seq", String(seq));
    partBody.append("size", String(slice.byteLength));
    partBody.append("file", toArrayBufferBlob(slice, input.mediaType), input.fileName);

    await requestFeishuBitable("/drive/v1/medias/upload_part", uploadPartDataSchema, {
      body: partBody,
      dependencies,
      method: "POST",
      providerId: input.providerId,
      signal: input.signal,
    });
  }

  const finished = await requestFeishuBitable(
    "/drive/v1/medias/upload_finish",
    uploadAllDataSchema,
    {
      body: {
        block_num: prepared.block_num,
        upload_id: prepared.upload_id,
      },
      dependencies,
      method: "POST",
      providerId: input.providerId,
      signal: input.signal,
    },
  );
  return finished.file_token;
}

export async function uploadFeishuBitableMedia(
  input: {
    appToken: string;
    bytes: Uint8Array;
    fileName: string;
    mediaType?: string;
    providerId?: FeishuProviderId;
    signal?: AbortSignal;
  },
  dependencies?: FeishuBitableDependencies,
): Promise<string> {
  const mediaType = input.mediaType || "application/octet-stream";
  const threshold = dependencies?.chunkThresholdBytes ?? FEISHU_UPLOAD_ALL_MAX_BYTES;
  if (input.bytes.byteLength > threshold) {
    return uploadMediaChunks({ ...input, mediaType }, dependencies);
  }

  const body = new FormData();
  body.append("file_name", input.fileName);
  body.append("parent_type", "bitable_file");
  body.append("parent_node", input.appToken);
  body.append("size", String(input.bytes.byteLength));
  body.append("file", toArrayBufferBlob(input.bytes, mediaType), input.fileName);

  const uploaded = await requestFeishuBitable("/drive/v1/medias/upload_all", uploadAllDataSchema, {
    body,
    dependencies,
    method: "POST",
    providerId: input.providerId,
    signal: input.signal,
  });
  return uploaded.file_token;
}

export async function createFeishuBitableRecord(
  input: {
    appToken: string;
    fields: FeishuBitableWriteFields;
    providerId?: FeishuProviderId;
    signal?: AbortSignal;
    tableId: string;
  },
  dependencies?: FeishuBitableDependencies,
): Promise<CreatedFeishuBitableRecord> {
  const result = await requestFeishuBitable(
    `/bitable/v1/apps/${encodeURIComponent(input.appToken)}/tables/${encodeURIComponent(input.tableId)}/records`,
    createRecordDataSchema,
    {
      body: { fields: input.fields },
      dependencies,
      method: "POST",
      providerId: input.providerId,
      signal: input.signal,
    },
  );
  return { recordId: result.record.record_id };
}

export async function getFeishuBitableRecord(
  input: {
    appToken: string;
    providerId?: FeishuProviderId;
    recordId: string;
    signal?: AbortSignal;
    tableId: string;
  },
  dependencies?: FeishuBitableDependencies,
): Promise<FeishuBitableRecordSnapshot> {
  const result = await requestFeishuBitable(
    `/bitable/v1/apps/${encodeURIComponent(input.appToken)}/tables/${encodeURIComponent(input.tableId)}/records/${encodeURIComponent(input.recordId)}`,
    readRecordDataSchema,
    {
      dependencies,
      method: "GET",
      providerId: input.providerId,
      signal: input.signal,
    },
  );
  return { fields: result.record.fields, recordId: result.record.record_id };
}

export async function updateFeishuBitableRecord(
  input: {
    appToken: string;
    fields: FeishuBitableWriteFields;
    providerId?: FeishuProviderId;
    recordId: string;
    signal?: AbortSignal;
    tableId: string;
  },
  dependencies?: FeishuBitableDependencies,
): Promise<CreatedFeishuBitableRecord> {
  const result = await requestFeishuBitable(
    `/bitable/v1/apps/${encodeURIComponent(input.appToken)}/tables/${encodeURIComponent(input.tableId)}/records/${encodeURIComponent(input.recordId)}`,
    updateRecordDataSchema,
    {
      body: { fields: input.fields },
      dependencies,
      method: "PUT",
      providerId: input.providerId,
      signal: input.signal,
    },
  );
  return { recordId: result.record.record_id };
}
