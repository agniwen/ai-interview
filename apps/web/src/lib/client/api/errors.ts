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
  readonly requestId: string | null;
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    options: {
      status: number;
      payload?: unknown;
      cause?: unknown;
      requestId?: string | null;
      retryAfterMs?: number | null;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ApiError";
    this.status = options.status;
    this.payload = options.payload ?? null;
    this.requestId = options.requestId ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

export function safeApiErrorMessage(
  message: string | null,
  status: number,
  fallback?: string,
): string {
  if (message && !/<\/?[a-z!][^>]*>/i.test(message)) {
    return message.slice(0, 500);
  }
  if ([502, 503, 504].includes(status)) {
    return "服务暂时不可用，请稍后重试。";
  }
  if (status === 401) {
    return "登录已失效，请重新登录后重试。";
  }
  if (status === 403) {
    return "没有操作权限，请联系管理员。";
  }
  if (status === 429) {
    return "请求过于频繁，请稍后重试。";
  }
  return fallback ?? `请求失败（${status}），请稍后重试。`;
}

export function apiErrorResponseMetadata(response: Response) {
  const id = response.headers.get("x-request-id");
  const retryAfter = response.headers.get("retry-after");
  let delay = Number.NaN;
  if (retryAfter !== null) {
    delay = /^\d+(?:\.\d+)?$/.test(retryAfter)
      ? Number(retryAfter) * 1000
      : Date.parse(retryAfter) - Date.now();
  }
  return {
    requestId: id && /^[\w.:-]{1,128}$/.test(id) ? id : null,
    retryAfterMs: Number.isFinite(delay) ? Math.max(0, delay) : null,
  };
}

/**
 * 类型守卫：判断是否为 `ApiError`。
 * Type guard for `ApiError`.
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
