import { createHash } from "node:crypto";
import type { ResumeProfile } from "@app/db-schema/interview/types";
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

export function computeResumeEvaluationInputHash(input: {
  resumeContentHash?: string | null;
  resumeProfile: ResumeProfile;
  resumeText: string | null;
}): string {
  const { email: _email, name: _name, phone: _phone, ...contentProfile } = input.resumeProfile;
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize(
          jsonValueSchema.parse({
            resumeContentHash: input.resumeContentHash ?? null,
            resumeProfile: contentProfile,
            resumeText: input.resumeText,
          }),
        ),
      ),
    )
    .digest("hex");
}
