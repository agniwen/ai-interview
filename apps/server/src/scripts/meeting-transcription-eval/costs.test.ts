import { describe, expect, it } from "vitest";
import { applyMeetingTranscriptionActualCosts } from "./costs";
import type { MeetingTranscriptionBenchmarkRun } from "./types";

const run: MeetingTranscriptionBenchmarkRun = {
  actualCostUsd: null,
  caseId: "case-01",
  deletion: "not-applicable",
  latencyMs: 1000,
  model: "model",
  provider: "openai",
  region: "international",
  retryCount: 0,
  score: null,
  status: "failed",
};

describe("Meeting transcription actual cost ledger", () => {
  it("hydrates the original provider run without rerunning paid transcription", () => {
    expect(applyMeetingTranscriptionActualCosts([run], { openai: { "case-01": 0.42 } })).toEqual([
      { ...run, actualCostUsd: 0.42 },
    ]);
    expect(applyMeetingTranscriptionActualCosts([run], {})).toEqual([run]);
    expect(
      applyMeetingTranscriptionActualCosts([{ ...run, actualCostUsd: 0.21 }], {
        openai: {},
      }),
    ).toEqual([{ ...run, actualCostUsd: 0.21 }]);
  });

  it("refuses a cost ledger that omits reconciled ambiguous attempts", () => {
    expect(() =>
      applyMeetingTranscriptionActualCosts([{ ...run, reconciledAttemptCostUsd: 0.5 }], {
        openai: { "case-01": 0.4 },
      }),
    ).toThrow("lower than reconciled ambiguous attempts");
  });
});
