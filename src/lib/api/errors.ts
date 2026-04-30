/**
 * API 客户端的错误类型定义。
 * Error definitions for the API client.
 *
 * 调用方应当通过 `instanceof ApiError` 或 `isApiError` 区分网络异常 / 业务异常，
 * 然后从 `status` / `payload` 中读取所需信息。
 *
 * Callers should distinguish business errors via `instanceof ApiError` (or `isApiError`)
 * and read details from `status` / `payload`.
 */

/**
 * 由 `apiFetch` 抛出的统一错误。
 * Uniform error thrown by `apiFetch`.
 */
export class ApiError extends Error {
  /**
   * HTTP 状态码（0 表示尚未发出请求 / 网络层失败）。
   * HTTP status code (0 indicates the request never reached the network).
   */
  readonly status: number;

  /**
   * 服务端返回的解码后正文（可能为 string / 对象 / null）。
   * Decoded body returned by the server (may be string, object or null).
   */
  readonly payload: unknown;

  constructor(message: string, options: { status: number; payload?: unknown; cause?: unknown }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ApiError";
    this.status = options.status;
    this.payload = options.payload ?? null;
  }
}

/**
 * 类型守卫：判断是否为 `ApiError`。
 * Type guard for `ApiError`.
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
