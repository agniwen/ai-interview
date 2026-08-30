import { createHash } from "node:crypto";
import type { JobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import { z } from "zod";

const jsonValueSchema = z.json();

type JsonValue = z.infer<typeof jsonValueSchema>;

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && value instanceof Object) {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function canonicalizeConfig(
  config: JobDescriptionStructuredConfig,
): JobDescriptionStructuredConfig {
  return {
    ...config,
    exclusionConditions: config.exclusionConditions.toSorted((left, right) =>
      left.id.localeCompare(right.id),
    ),
    priorityConditions: config.priorityConditions.toSorted((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
}

export function computeJobEvaluationPayloadHash(value: JsonValue): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function computeJobEvaluationDraftInputHash(input: {
  description: string | null;
  prompt: string;
  structuredConfig: JobDescriptionStructuredConfig;
}): string {
  return computeJobEvaluationPayloadHash({
    description: input.description?.trim() || null,
    prompt: input.prompt.trim(),
    structuredConfig: canonicalizeConfig(input.structuredConfig),
  });
}
