import { describe, expect, it } from "vitest";
import { listMeetingTranscriptionProviderCandidates } from "./provider-registry";

describe("Meeting transcription provider registry", () => {
  it("exposes only deployment-enabled production adapters", () => {
    expect(
      listMeetingTranscriptionProviderCandidates({
        ALIBABA_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        DEEPGRAM_BASE_URL: "https://api.eu.deepgram.com",
        MEETING_TRANSCRIPTION_DEEPGRAM_ENABLED: "true",
        MEETING_TRANSCRIPTION_DEEPGRAM_MODEL: "nova-3",
        MEETING_TRANSCRIPTION_OPENAI_ENABLED: "true",
        MEETING_TRANSCRIPTION_QWEN_ENABLED: "true",
        MEETING_TRANSCRIPTION_QWEN_MODEL: "qwen3-asr-flash-filetrans",
      } as NodeJS.ProcessEnv),
    ).toEqual([
      {
        id: "deepgram",
        label: "Deepgram Nova-3（候选）",
        model: "nova-3",
        region: "deepgram-eu",
      },
      {
        id: "openai",
        label: "OpenAI Diarized Transcription（候选）",
        model: "gpt-4o-transcribe-diarize",
        region: "openai-default",
      },
      {
        id: "qwen",
        label: "通义千问 ASR（百炼 Qwen3-ASR-Flash）",
        model: "qwen3-asr-flash-filetrans",
        region: "qwen-cn-beijing",
      },
    ]);
  });

  it("rejects production endpoints whose region cannot be verified", () => {
    expect(() =>
      listMeetingTranscriptionProviderCandidates({
        DEEPGRAM_BASE_URL: "https://proxy.example.com",
        MEETING_TRANSCRIPTION_DEEPGRAM_ENABLED: "true",
      } as NodeJS.ProcessEnv),
    ).toThrow("not in the verified region map");
    expect(() =>
      listMeetingTranscriptionProviderCandidates({
        DEEPGRAM_BASE_URL: "http://api.deepgram.com",
        MEETING_TRANSCRIPTION_DEEPGRAM_ENABLED: "true",
      } as NodeJS.ProcessEnv),
    ).toThrow("must use HTTPS");
  });
});
