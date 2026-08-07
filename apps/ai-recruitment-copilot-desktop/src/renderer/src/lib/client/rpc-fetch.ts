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
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...init?.headers,
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
    throw new ApiError(extractErrorMessage(payload) ?? errorFallback, {
      payload,
      status: response.status,
    });
  }

  return payload as T;
}
