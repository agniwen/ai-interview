import { z } from "zod";

const metadataSchema = z.object({
  cause: z.unknown().optional(),
  code: z.union([z.string(), z.number()]).nullish(),
  message: z.string().optional(),
  requestID: z.string().nullish(),
  request_id: z.string().nullish(),
  responseHeaders: z.record(z.string(), z.string()).nullish(),
  status: z.number().nullish(),
  statusCode: z.number().nullish(),
});

function safeEndpoint(value: string | undefined): string {
  try {
    const url = new URL(value ?? "");
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "未配置或地址无效";
  }
}

function redact(value: string): string {
  let result = value;
  for (const [key, secret] of Object.entries(process.env)) {
    if (/(?:API_KEY|TOKEN|SECRET|PASSWORD)$/.test(key) && secret) {
      result = result.replaceAll(secret, "<REDACTED>");
    }
  }
  return result
    .replaceAll(/https?:\/\/[^\s<>"']+/g, (url) => safeEndpoint(url))
    .replaceAll(/Bearer\s+[^\s,;]+/gi, "Bearer <REDACTED>")
    .replaceAll(/\bsk-[\w-]+/g, "<REDACTED>");
}

function getRequestId(data: z.infer<typeof metadataSchema>): string | undefined {
  return data.request_id ?? data.requestID ?? data.responseHeaders?.["x-request-id"] ?? undefined;
}

// Persist only diagnostic scalars. SDK request/response bodies can contain resume content.
export function describeResumeParseError(
  error: Error,
  context: { endpoint?: string; model?: string; stage: string },
): Error {
  let current: unknown = error;
  let status: number | undefined;
  let code: string | number | undefined;
  let requestId: string | undefined;
  const messages: string[] = [];
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const parsed = metadataSchema.safeParse(current);
    if (!parsed.success) {
      break;
    }
    const { data } = parsed;
    status ??= data.status ?? data.statusCode ?? undefined;
    code ??= data.code ?? undefined;
    requestId ??= getRequestId(data);
    if (data.message && !messages.includes(data.message)) {
      messages.push(data.message);
    }
    current = data.cause;
  }
  if (messages.length === 0) {
    messages.push(error.message);
  }
  const details = [
    "provider=alibaba",
    `model=${context.model || "未配置"}`,
    `endpoint=${safeEndpoint(context.endpoint)}`,
    status === undefined ? null : `HTTP=${status}`,
    code === undefined ? null : `code=${code}`,
    requestId ? `requestId=${requestId}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  const message = redact(`${context.stage}失败 [${details}] ${messages.join("; ")}`);
  return new Error(message.slice(0, 1000), { cause: error });
}
