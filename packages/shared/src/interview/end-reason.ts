import type { JsonObject } from "@arc/db-schema/json";
import { z } from "zod";

export const INTERVIEW_END_REASON = {
  CANDIDATE_CLICKED_END: "candidate_clicked_end",
} as const;

const interviewEndReasonMetadataSchema = z.object({
  closeReason: z.string().trim().min(1).optional(),
});

export function readInterviewEndReason(metadata: JsonObject | null | undefined): string | null {
  const parsed = interviewEndReasonMetadataSchema.safeParse(metadata ?? {});
  return parsed.success ? (parsed.data.closeReason ?? null) : null;
}

export function mergeInterviewEndReasonMetadata(
  existing: JsonObject | null | undefined,
  incoming: JsonObject | null | undefined,
): JsonObject {
  const merged = { ...existing, ...incoming };
  const existingReason = readInterviewEndReason(existing);
  const incomingReason = readInterviewEndReason(incoming);
  const closeReason =
    existingReason === INTERVIEW_END_REASON.CANDIDATE_CLICKED_END
      ? existingReason
      : (incomingReason ?? existingReason);

  return closeReason ? { ...merged, closeReason } : merged;
}
