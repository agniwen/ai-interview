import { createHash } from "node:crypto";
import type { JobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
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

export function computeJobEvaluationPayloadHash(value: unknown): string {
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
