import { ApiError } from "./api-error";

function extractErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  if ("error" in data && typeof data.error === "string") {
    return data.error;
  }
  if ("message" in data && typeof data.message === "string") {
    return data.message;
  }
  return null;
}

/**
 * JSON fetch against the auth/API host with credentials (session cookies).
 */
export async function apiJson<T>(
  input: string,
  errorFallback: string,
  init?: RequestInit & { allow404?: boolean },
): Promise<T> {
  const { allow404, ...requestInit } = init ?? {};
  const response = await fetch(input, {
    ...requestInit,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...requestInit.headers,
    },
  });

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    if (allow404 && response.status === 404) {
      return null as T;
    }
    throw new ApiError(extractErrorMessage(payload) ?? errorFallback, {
      payload,
      status: response.status,
    });
  }

  return payload as T;
}
