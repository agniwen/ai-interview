import { describe, expect, it } from "vitest";
import { listMeetingTranscriptionProviderCandidates } from "./provider-registry";

describe("Meeting transcription provider registry", () => {
  it("exposes only the enabled Qwen adapter", () => {
    expect(
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      listMeetingTranscriptionProviderCandidates({
        ALIBABA_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        MEETING_TRANSCRIPTION_QWEN_ENABLED: "true",
        MEETING_TRANSCRIPTION_QWEN_MODEL: "qwen3-asr-flash-filetrans",
      } as NodeJS.ProcessEnv),
    ).toEqual([
      {
        id: "qwen",
        label: "通义千问 ASR（百炼 Qwen3-ASR-Flash）",
        model: "qwen3-asr-flash-filetrans",
        region: "qwen-cn-beijing",
      },
    ]);
  });

  it("returns no candidates when Qwen is disabled", () => {
    expect(
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      listMeetingTranscriptionProviderCandidates({
        MEETING_TRANSCRIPTION_QWEN_ENABLED: "false",
      } as NodeJS.ProcessEnv),
    ).toEqual([]);
  });
});
