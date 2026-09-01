import type { z } from "zod";

// Shared by backend runtimes that need to validate structured model output.

const JSON_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)\s*```/;

function extractJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let escaped = false;
  let inString = false;
  let start = -1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (start === -1) {
      if (character === "{") {
        depth = 1;
        start = index;
      }
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return objects;
}

/**
 * Extract and validate JSON from model text output.
 * Models without native structured output often wrap JSON in markdown code
 * blocks or output it inline. This helper tries both patterns, then validates
 * the extracted object against the supplied Zod schema.
 */
export function parseJsonOutput<TSchema extends z.ZodType>(
  text: string,
  schema: TSchema,
  label: string,
  options: {
    allowEmptyDefaults?: boolean;
    // oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- raw JSON is normalized immediately before schema parsing.
    normalizeInvalid?: (value: unknown) => unknown;
  } = {},
): z.output<TSchema> {
  const trimmed = text.trim();
  if (options.allowEmptyDefaults && trimmed.length === 0) {
    const empty = schema.safeParse({});
    if (empty.success) {
      console.warn(`[${label}] Empty model response; using schema-defined empty defaults.`);
      return empty.data;
    }
  }

  const blockMatch = JSON_BLOCK_RE.exec(trimmed);
  const sources = blockMatch ? [blockMatch[1], trimmed] : [trimmed];
  const candidates = [...new Set(sources.flatMap(extractJsonObjects))];

  let lastJsonError: unknown;
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      const raw = JSON.parse(candidate);
      const parsed = schema.safeParse(options.normalizeInvalid?.(raw) ?? raw);
      if (parsed.success) {
        return parsed.data;
      }
      console.error(
        `[${label}] Schema validation failed:`,
        parsed.error.issues.slice(0, 3).map((issue) => ({
          code: issue.code,
          path: issue.path,
        })),
      );
    } catch (error) {
      // 记下 JSON.parse 失败原因，便于区分"截断"vs"schema 不匹配"vs"格式异常"。
      // Capture parse failures so we can distinguish truncation vs schema vs format issues.
      lastJsonError = error;
    }
  }

  console.error(`[${label}] Failed to parse JSON from model response.`, {
    candidateCount: candidates.length,
    hasJsonParseError: lastJsonError !== undefined,
    textLength: trimmed.length,
  });
  throw new Error("Failed to parse structured output from model response.");
}
