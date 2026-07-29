import { createHash } from "node:crypto";
import type { ResumeProfile } from "@arc/db-schema/interview/types";

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

export function computeResumeEvaluationInputHash(input: {
  resumeContentHash?: string | null;
  resumeProfile: ResumeProfile;
  resumeText: string | null;
}): string {
  const { email: _email, name: _name, phone: _phone, ...contentProfile } = input.resumeProfile;
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize({
          resumeContentHash: input.resumeContentHash ?? null,
          resumeProfile: contentProfile,
          resumeText: input.resumeText,
        }),
      ),
    )
    .digest("hex");
}
