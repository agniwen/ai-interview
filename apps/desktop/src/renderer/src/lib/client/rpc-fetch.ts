import { z } from "zod";
import { ApiError } from "./api-error";

const errorPayloadSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
});

function extractErrorMessage<const T>(data: T): string | null {
  const parsed = errorPayloadSchema.safeParse(data);
  return parsed.success ? (parsed.data.error ?? parsed.data.message ?? null) : null;
}

function parsePayloadText(text: string) {
  if (!text) {
    return null;
  }
  try {
    return z.json().parse(JSON.parse(text));
  } catch {
    return text;
  }
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

  const text = await response.text();
  const payload = parsePayloadText(text);

  if (!response.ok) {
    if (allow404 && response.status === 404) {
      // SAFETY: allow404 is selected only by callers whose T explicitly includes null.
      return null as T;
    }
    throw new ApiError(extractErrorMessage(payload) ?? errorFallback, {
      payload,
      status: response.status,
    });
  }

  // SAFETY: apiJson callers own the endpoint DTO contract after the payload passes JSON decoding.
  return payload as T;
}
