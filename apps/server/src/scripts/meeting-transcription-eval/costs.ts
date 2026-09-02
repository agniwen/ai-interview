import { z } from "zod";
import { meetingTranscriptionProviderSchema } from "@app/shared/meeting-transcription";
import type { MeetingTranscriptionBenchmarkRun } from "./types";

export const meetingTranscriptionCostLedgerSchema = z.partialRecord(
  meetingTranscriptionProviderSchema,
  z.record(z.string(), z.number().nonnegative()),
);

export function applyMeetingTranscriptionActualCosts(
  runs: MeetingTranscriptionBenchmarkRun[],
  ledger: z.infer<typeof meetingTranscriptionCostLedgerSchema>,
): MeetingTranscriptionBenchmarkRun[] {
  return runs.map((run) => {
    const actualCostUsd = ledger[run.provider]?.[run.caseId] ?? run.actualCostUsd;
    if (actualCostUsd !== null && actualCostUsd < (run.reconciledAttemptCostUsd ?? 0)) {
      throw new Error(
        `Actual cost for ${run.provider}/${run.caseId} is lower than reconciled ambiguous attempts`,
      );
    }
    return { ...run, actualCostUsd };
  });
}
