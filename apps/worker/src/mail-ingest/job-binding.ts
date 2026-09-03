import type { MailIngestJdBindStatus } from "@app/db-schema/schema";

/**
 * 由现有 resolveMailJobBinding 已算出的中间值派生 jdBindStatus（仅观测，不改绑定动作）。
 */
export function deriveJdBindStatus(input: {
  matchedJobIdCount: number;
  hasDefaultJd: boolean;
}): MailIngestJdBindStatus {
  if (input.matchedJobIdCount === 1) {
    return "bound";
  }
  if (input.matchedJobIdCount >= 2) {
    return "ambiguous";
  }
  return input.hasDefaultJd ? "fallback" : "unmatched";
}
