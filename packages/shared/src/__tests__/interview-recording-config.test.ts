import { describe, expect, it } from "vitest";
import { resolveInterviewRecordingEnabled } from "@arc/shared/interview/recording-config";

describe("interview recording config", () => {
  it("enables interview recording by default", () => {
    expect(resolveInterviewRecordingEnabled({})).toBe(true);
    expect(
      resolveInterviewRecordingEnabled({
        NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING: undefined,
      }),
    ).toBe(true);
  });

  it("disables interview recording only when the env value is false", () => {
    expect(
      resolveInterviewRecordingEnabled({
        NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING: "false",
      }),
    ).toBe(false);
    expect(
      resolveInterviewRecordingEnabled({
        NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING: "true",
      }),
    ).toBe(true);
  });
});
