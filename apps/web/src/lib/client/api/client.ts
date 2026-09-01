/**
 * 统一的前端 API 调用入口：`apiFetch<T>(path, init)`。
 * Centralized frontend API entry point: `apiFetch<T>(path, init)`.
 *
 * 这一层负责：
 * 1) 自动序列化 `body` 为 JSON（除非传入 FormData / Blob / 字符串等）；
 * 2) 自动附加 `Content-Type` 与 `credentials`；
 * 3) 统一抛出 {@link ApiError}；
 * 4) 默认按 JSON 解码，必要时可指定 raw / text / blob。
 *
 * Responsibilities:
 * 1) auto-serialize plain objects to JSON (FormData / Blob / string passes through);
 * 2) inject default headers and `credentials: "include"`;
 * 3) throw {@link ApiError} on non-OK responses;
 * 4) decode responses as JSON by default (use `raw` to handle the Response yourself).
 */

import { ApiError } from "./errors";
import { z } from "zod";
import { backendApiUrl } from "@/lib/client/backend-api";

const apiErrorPayloadSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.json()),
  z.record(z.string(), z.json()),
]);
const apiErrorMessageSchema = z.object({
  error: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
});
type ApiErrorPayload = z.infer<typeof apiErrorPayloadSchema>;

/**
 * `apiFetch` 的额外配置。
 * Extra options for {@link apiFetch}.
 */
export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  /**
   * 请求体：对象会被自动 JSON.stringify，FormData / Blob / string 透传。
   * Request body: plain objects are JSON.stringify'd, FormData / Blob / string pass through.
   */
  body?: BodyInit | object | unknown[];

  /**
   * 解码方式，默认为 `json`。设为 `raw` 时返回原始 Response 给调用方自行处理。
   * Response decoder, defaults to `json`. `raw` returns the Response itself.
   */
  decode?: "json" | "raw";

  /**
   * 是否允许 404 静默：返回 `null` 而不是抛出。
   * When true, 404 responses resolve to `null` instead of throwing.
   */
  allow404?: boolean;
}

/**
 * 内部判定：什么样的 body 不需要序列化？
 * Internal helper deciding whether a body should be passed through unchanged.
 */
function isRawBody(value: unknown): value is BodyInit {
  return (
    z.string().safeParse(value).success ||
    value instanceof FormData ||
    value instanceof Blob ||
    value instanceof URLSearchParams ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  );
}

/**
 * 尝试把错误响应解码为对象 / 文本，失败则返回 null。
 * Best-effort decode of an error response body.
 */
async function readErrorPayload(response: Response): Promise<ApiErrorPayload> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return null;
  }
  try {
    return apiErrorPayloadSchema.parse(JSON.parse(text));
  } catch {
    return text;
  }
}

/**
 * 从 payload 中提取人类可读的错误信息。
 * Extract a human-readable message from an error payload.
 */
function extractMessage(payload: ApiErrorPayload): string | null {
  const parsedText = z.string().min(1).safeParse(payload);
  if (parsedText.success) {
    return parsedText.data;
  }
  const parsedMessage = apiErrorMessageSchema.safeParse(payload);
  if (parsedMessage.success) {
    return parsedMessage.data.message ?? parsedMessage.data.error ?? null;
  }
  return null;
}

/**
 * 调用独立后端的特殊传输路由（multipart / stream / binary）。
 * Call a special-transport route on the standalone backend.
 *
 * @example
 * ```ts
 * const list = await apiFetch<{ items: Foo[] }>("/workspaces/acme/foos");
 * await apiFetch("/public/foos", { method: "POST", body: { name: "x" } });
 * ```
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, decode = "json", allow404 = false, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  let finalBody: BodyInit | undefined;

  if (body !== undefined && body !== null) {
    if (isRawBody(body)) {
      finalBody = body;
    } else {
      finalBody = JSON.stringify(body);
      if (!finalHeaders.has("Content-Type")) {
        finalHeaders.set("Content-Type", "application/json");
      }
    }
  }

  let response: Response;
  try {
    response = await fetch(backendApiUrl(path), {
      credentials: "include",
      ...rest,
      body: finalBody,
      headers: finalHeaders,
    });
  } catch (networkError) {
    throw new ApiError("网络请求失败 / Network request failed", {
      cause: networkError,
      status: 0,
    });
  }

  if (response.status === 404 && allow404) {
    // SAFETY: allow404 is the caller-selected null branch of this generic response contract.
    return null as T;
  }

  if (!response.ok) {
    const payload = await readErrorPayload(response);
    const message = extractMessage(payload) ?? `请求失败 / Request failed (${response.status})`;
    throw new ApiError(message, { payload, status: response.status });
  }

  if (decode === "raw") {
    // SAFETY: decode="raw" explicitly selects Response as the caller's generic result.
    return response as T;
  }

  // `json` 默认；空响应安全降级为 null。
  // `json` default; empty responses fall back to null.
  const text = await response.text();
  if (!text) {
    // SAFETY: empty successful responses use the documented null fallback for the generic contract.
    return null as T;
  }
  const parsedJson = z.json().parse(JSON.parse(text));
  // SAFETY: apiFetch callers supply the endpoint DTO; z.json establishes a valid JSON wire value first.
  return parsedJson as T;
}
