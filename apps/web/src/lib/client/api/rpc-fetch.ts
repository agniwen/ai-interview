import { z } from "zod";
import { ApiError } from "./errors";

interface ApiResult {
  data: unknown;
  error: unknown;
  response?: Response;
}

type ApiCall = Promise<ApiResult>;
type ContextualResponse = Awaited<ReturnType<Response["json"]>>;

const apiErrorSchema = z.object({
  error: z.string().optional(),
  message: z.union([z.string(), z.array(z.string())]).optional(),
});

function rebuildConsumedResponse(result: ApiResult, response: Response): Response {
  const payload = result.error === undefined ? result.data : result.error;
  const hasResponseBody = ![204, 205, 304].includes(response.status) && payload !== undefined;
  const headers = new Headers(response.headers);
  let body: BodyInit | null = null;

  if (hasResponseBody) {
    const contentType = headers.get("Content-Type") ?? "";
    const parsedText = z.string().safeParse(payload);
    body =
      contentType.startsWith("text/") && parsedText.success
        ? parsedText.data
        : JSON.stringify(payload);
    if (!contentType) {
      headers.set("Content-Type", "application/json");
    }
  }

  return new Response(body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

/**
 * 解包 Hey API 的字段式响应，并统一转换为项目的 ApiError。
 * Unwrap Hey API's field-style response and normalize failures to ApiError.
 */
export function apiRequest<T = ContextualResponse>(
  promise: ApiCall,
  errorFallback: string,
): Promise<T>;
export function apiRequest<T = ContextualResponse>(
  promise: ApiCall,
  errorFallback: string,
  options: { allow404: true },
): Promise<T | null>;
export async function apiRequest<T = ContextualResponse>(
  promise: ApiCall,
  errorFallback: string,
  options?: { allow404?: boolean },
): Promise<T | null> {
  const result = await promise;
  if (options?.allow404 && result.response?.status === 404) {
    return null;
  }
  if (result.error !== undefined) {
    const parsedError = apiErrorSchema.safeParse(result.error);
    const parsedMessage = parsedError.success
      ? (parsedError.data.error ?? parsedError.data.message)
      : null;
    const message = Array.isArray(parsedMessage)
      ? parsedMessage.join("；")
      : (parsedMessage ?? errorFallback);
    throw new ApiError(message, {
      cause: result.error,
      payload: result.error,
      status: result.response?.status ?? 0,
    });
  }
  // SAFETY: Hey API places the operation's declared success body in `data`;
  // callers bind T to that operation's response contract.
  return result.data as T;
}

/** Return the raw response for callers that inspect status/body themselves. */
export async function apiResponse(promise: ApiCall): Promise<Response> {
  const result = await promise;
  if (result.response) {
    return result.response.bodyUsed
      ? rebuildConsumedResponse(result, result.response)
      : result.response;
  }
  throw new ApiError("网络请求失败 / Network request failed", {
    cause: result.error,
    payload: result.error,
    status: 0,
  });
}
