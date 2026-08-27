import type { ClientResponse } from "hono/client";
import { DetailedError, parseResponse } from "hono/client";
import { z } from "zod";
import { ApiError } from "./errors";

// 保留 hc Promise 的具体响应联合类型，并只提取 ok 响应的 JSON body。
// Keeping the concrete response union on the Promise avoids Hono's large status-filter
// conditional type at every call site while preserving the same successful JSON body.
type RpcCall = Promise<ClientResponse<unknown>>;
type SuccessfulJsonBody<T> = T extends {
  json(): Promise<infer Body>;
  ok: true;
}
  ? Body
  : never;
type RpcResult<T extends RpcCall> = SuccessfulJsonBody<Awaited<T>>;

const rpcErrorSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
});
const detailedErrorSchema = z.object({ data: z.json().optional() });

function extractRpcErrorMessage<const T>(data: T): string | null {
  const parsed = rpcErrorSchema.safeParse(data);
  return parsed.success ? (parsed.data.error ?? parsed.data.message ?? null) : null;
}

/**
 * 把 hc/rpc 的调用结果解码成 JSON：基于 Hono 官方 `parseResponse` 包装一层，
 * 失败时把 {@link DetailedError} 转成本项目统一的 {@link ApiError}（带中文兜底
 * 文案 + status + payload）；`allow404: true` 时 404 静默为 null（用于幂等
 * GET / DELETE）。
 *
 * Thin wrapper around Hono's `parseResponse` (`hono/client`): converts
 * {@link DetailedError} thrown on non-OK responses into the project-wide
 * {@link ApiError} so existing UI catch-blocks and error toasts keep working.
 * `allow404: true` resolves a 404 to `null` instead of throwing.
 *
 * 调用方传入 hc 调用产生的 Promise（不需要 await），返回类型直接由后端响应推导：
 *   `rpcFetch(rpc.api.foo.$get(), "加载失败")`
 *
 * Pass the `Promise<Response>` produced by an hc call directly — matches the
 * Hono docs idiom and saves one `await`.
 */
export function rpcFetch<T extends RpcCall>(
  promise: T,
  errorFallback: string,
): Promise<RpcResult<T>>;
export function rpcFetch<T extends RpcCall>(
  promise: T,
  errorFallback: string,
  options: { allow404: true },
): Promise<RpcResult<T> | null>;
export async function rpcFetch<T extends RpcCall>(
  promise: T,
  errorFallback: string,
  options?: { allow404?: boolean },
): Promise<RpcResult<T> | null> {
  try {
    // SAFETY: rpcFetch accepts JSON hc calls only; RpcResult selects the same ok response
    // body that parseResponse returns and excludes non-ok branches handled below.
    return (await parseResponse(promise)) as RpcResult<T>;
  } catch (error) {
    if (!(error instanceof DetailedError)) {
      throw error;
    }
    if (options?.allow404 && error.statusCode === 404) {
      return null;
    }
    const parsedDetail = detailedErrorSchema.safeParse(error.detail);
    const data = parsedDetail.success ? (parsedDetail.data.data ?? null) : null;
    const serverMessage = extractRpcErrorMessage(data);
    throw new ApiError(serverMessage ?? errorFallback, {
      cause: error,
      payload: data,
      status: error.statusCode ?? 0,
    });
  }
}
