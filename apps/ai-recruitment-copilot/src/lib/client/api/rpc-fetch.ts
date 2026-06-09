import type { ClientResponse } from "hono/client";
import { DetailedError, parseResponse } from "hono/client";
import { ApiError } from "./errors";

// hc 的调用结果是 ClientResponse<...> 的子类型，封装一层别名让签名更简洁。
// hc returns ClientResponse subtypes; this alias keeps the rpcFetch signature compact.
type RpcCall = Promise<ClientResponse<unknown>>;

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
 * 调用方传入 hc 调用产生的 Promise（不需要 await），与 Hono 文档示例一致：
 *   `rpcFetch<T>(rpc.api.foo.$get(), "加载失败")`
 *
 * Pass the `Promise<Response>` produced by an hc call directly — matches the
 * Hono docs idiom and saves one `await`.
 */
export async function rpcFetch<T>(promise: RpcCall, errorFallback: string): Promise<T>;
export async function rpcFetch<T>(
  promise: RpcCall,
  errorFallback: string,
  options: { allow404: true },
): Promise<T | null>;
export async function rpcFetch<T>(
  promise: RpcCall,
  errorFallback: string,
  options?: { allow404?: boolean },
): Promise<T | null> {
  try {
    return (await parseResponse(promise)) as T;
  } catch (error) {
    if (!(error instanceof DetailedError)) {
      throw error;
    }
    if (options?.allow404 && error.statusCode === 404) {
      return null;
    }
    const data = (error.detail as { data?: unknown } | undefined)?.data ?? null;
    const serverMessage =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : null;
    throw new ApiError(serverMessage ?? errorFallback, {
      cause: error,
      payload: data,
      status: error.statusCode ?? 0,
    });
  }
}
