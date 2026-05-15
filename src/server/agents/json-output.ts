import type { z } from "zod";

const JSON_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)\s*```/;

/**
 * Extract and validate JSON from model text output.
 * Models without native structured output often wrap JSON in markdown code
 * blocks or output it inline. This helper tries both patterns, then validates
 * the extracted object against the supplied Zod schema.
 */
export function parseJsonOutput<T>(text: string, schema: z.ZodType<T>, label: string): T {
  const trimmed = text.trim();

  const blockMatch = JSON_BLOCK_RE.exec(trimmed);
  const candidates = blockMatch ? [blockMatch[1], trimmed] : [trimmed];

  let lastJsonError: unknown;
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1) {
      continue;
    }

    const slice = candidate.slice(start, end + 1);
    try {
      const raw = JSON.parse(slice);
      const parsed = schema.safeParse(raw);
      if (parsed.success) {
        return parsed.data;
      }
      console.error(`[${label}] Schema validation failed:`, parsed.error.issues.slice(0, 3));
    } catch (error) {
      // 记下 JSON.parse 失败原因，便于区分"截断"vs"schema 不匹配"vs"格式异常"。
      // Capture parse failures so we can distinguish truncation vs schema vs format issues.
      lastJsonError = error;
    }
  }

  console.error(
    `[${label}] Failed to parse JSON from text (len=${trimmed.length}):`,
    `\n  parseError: ${lastJsonError instanceof Error ? lastJsonError.message : String(lastJsonError ?? "n/a")}`,
    `\n  head: ${trimmed.slice(0, 200)}`,
    `\n  tail: ${trimmed.slice(-200)}`,
  );
  throw new Error("Failed to parse structured output from model response.");
}
