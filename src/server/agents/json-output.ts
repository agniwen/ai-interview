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

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1) {
      continue;
    }

    try {
      const raw = JSON.parse(candidate.slice(start, end + 1));
      const parsed = schema.safeParse(raw);
      if (parsed.success) {
        return parsed.data;
      }
      console.error(`[${label}] Schema validation failed:`, parsed.error.issues.slice(0, 3));
    } catch {
      // try next candidate
    }
  }

  console.error(`[${label}] Failed to parse JSON from text:`, trimmed.slice(0, 200));
  throw new Error("Failed to parse structured output from model response.");
}
