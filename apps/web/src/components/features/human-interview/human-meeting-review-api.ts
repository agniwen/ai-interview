import { z } from "zod";

// Review routes deliberately omit their schema from the global RPC type to avoid TS depth limits.
const errorResponseSchema = z.object({ error: z.string() });
const jsonBodySchema = z.json();
type JsonBody = z.infer<typeof jsonBodySchema>;

export async function requestReviewJson<TResult>(
  path: string,
  init?: RequestInit,
): Promise<TResult> {
  const response = await fetch(path, init);
  let body: JsonBody = null;
  try {
    body = jsonBodySchema.parse(await response.json());
  } catch {
    body = null;
  }
  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    const message = parsed.success ? parsed.data.error : "操作失败，请稍后重试。";
    throw new Error(message);
  }
  // SAFETY: each caller supplies the shared DTO for its corresponding JSON endpoint.
  return body as TResult;
}
