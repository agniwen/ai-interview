import { describe, expect, it } from "vitest";
import {
  canonicalMeetingTranscriptSchema,
  createMeetingLiveTranscriptAuthorizationSchema,
  createMeetingTranscriptCorrectionSchema,
  meetingLiveTranscriptDraftSchema,
  updateMeetingTranscriptionPolicySchema,
} from "./meeting-transcription";

describe("Meeting transcription contracts", () => {
  it("accepts only provider-neutral canonical turns", () => {
    expect(
      canonicalMeetingTranscriptSchema.parse({
        language: "zh",
        turns: [
          {
            confidence: null,
            endMs: 2600,
            speakerKey: "local",
            startMs: 1000,
            text: "大家好",
            track: "local",
          },
          {
            confidence: 0.92,
            endMs: 4100,
            speakerKey: "remote-0",
            startMs: 2700,
            text: "你好",
            track: "remote",
          },
        ],
      }),
    ).toMatchObject({ turns: [{ speakerKey: "local" }, { speakerKey: "remote-0" }] });

    expect(
      canonicalMeetingTranscriptSchema.safeParse({
        language: "zh",
        provider_request_id: "provider-native",
        segments: [],
        turns: [],
      }).success,
    ).toBe(false);
  });

  it("bounds the total canonical transcript text used by downstream projections", () => {
    expect(
      canonicalMeetingTranscriptSchema.safeParse({
        language: "zh",
        turns: Array.from({ length: 11 }, (_, index) => ({
          confidence: null,
          endMs: index + 1,
          speakerKey: "local",
          startMs: index,
          text: "字".repeat(100_000),
          track: "local",
        })),
      }).success,
    ).toBe(false);
  });

  it("requires the selected provider to be explicitly allowed", () => {
    expect(
      updateMeetingTranscriptionPolicySchema.safeParse({
        allowedProviders: [],
        fallbackProvider: null,
        selectedProvider: "openai",
        selectionReason: "同一授权语料评测后选择 OpenAI。",
      }).success,
    ).toBe(false);
    expect(
      updateMeetingTranscriptionPolicySchema.parse({
        allowedProviders: ["tingwu", "openai"],
        fallbackProvider: "openai",
        selectedProvider: "tingwu",
        selectionReason: "同一授权语料评测后，通义听悟在中文质量与区域要求上得分最高。",
      }),
    ).toEqual({
      allowedProviders: ["tingwu", "openai"],
      fallbackProvider: "openai",
      selectedProvider: "tingwu",
      selectionReason: "同一授权语料评测后，通义听悟在中文质量与区域要求上得分最高。",
    });
  });

  it("requires an allowed, distinct fallback and a recorded selection reason", () => {
    const base = {
      allowedProviders: ["deepgram", "openai"],
      fallbackProvider: "openai",
      selectedProvider: "deepgram",
    } as const;

    expect(
      updateMeetingTranscriptionPolicySchema.safeParse({ ...base, selectionReason: null }).success,
    ).toBe(false);
    expect(
      updateMeetingTranscriptionPolicySchema.safeParse({
        ...base,
        fallbackProvider: "deepgram",
        selectionReason: "同一授权语料评测后选择。",
      }).success,
    ).toBe(false);
    expect(
      updateMeetingTranscriptionPolicySchema.safeParse({
        ...base,
        allowedProviders: ["deepgram"],
        selectionReason: "同一授权语料评测后选择。",
      }).success,
    ).toBe(false);
    expect(
      updateMeetingTranscriptionPolicySchema.safeParse({
        allowedProviders: [],
        fallbackProvider: null,
        selectedProvider: null,
        selectionReason: null,
      }).success,
    ).toBe(true);
  });

  it("scopes live transcript authorization to one capture and source track", () => {
    expect(
      createMeetingLiveTranscriptAuthorizationSchema.parse({
        captureId: "00000000-0000-4000-8000-000000000077",
        track: "microphone",
      }),
    ).toEqual({
      captureId: "00000000-0000-4000-8000-000000000077",
      track: "microphone",
    });
    expect(
      createMeetingLiveTranscriptAuthorizationSchema.safeParse({
        captureId: "not-a-capture-id",
        track: "mixed",
      }).success,
    ).toBe(false);
  });

  it("validates durable live drafts without promoting them to canonical turns", () => {
    const draft = {
      capturedAt: "2026-08-12T08:00:00.000Z",
      droppedAudioMs: 0,
      droppedPcmFrames: 0,
      error: null,
      sections: [
        {
          id: "microphone-1",
          sequence: 0,
          startedAt: "2026-08-12T07:59:00.000Z",
          track: "microphone",
        },
      ],
      turns: [
        {
          final: true,
          id: "microphone-1:turn-1",
          sectionId: "microphone-1",
          text: "实时字幕草稿",
          track: "microphone",
        },
      ],
    };

    expect(meetingLiveTranscriptDraftSchema.safeParse(draft).success).toBe(true);
    expect(
      meetingLiveTranscriptDraftSchema.safeParse({
        ...draft,
        turns: [{ ...draft.turns[0], sectionId: "missing-section" }],
      }).success,
    ).toBe(false);
  });

  it("validates a human correction as a complete revision based on an existing revision", () => {
    const correction = createMeetingTranscriptCorrectionSchema.parse({
      language: "zh",
      sourceRevisionId: "00000000-0000-4000-8000-000000000078",
      turns: [
        {
          confidence: null,
          endMs: 2600,
          speakerDisplayName: "面试官",
          speakerKey: "local",
          startMs: 1000,
          text: "大家好",
          track: "local",
        },
        {
          confidence: null,
          endMs: 4100,
          speakerDisplayName: "候选人",
          speakerKey: "remote-0",
          startMs: 2700,
          text: "你好",
          track: "remote",
        },
      ],
    });

    expect(correction.turns[1]).toMatchObject({
      speakerDisplayName: "候选人",
      speakerKey: "remote-0",
    });
    expect(
      createMeetingTranscriptCorrectionSchema.safeParse({
        ...correction,
        turns: [
          correction.turns[1],
          { ...correction.turns[1], speakerDisplayName: "另一位候选人" },
        ],
      }).success,
    ).toBe(false);
    expect(
      createMeetingTranscriptCorrectionSchema.safeParse({
        ...correction,
        turns: [...correction.turns].toReversed(),
      }).success,
    ).toBe(false);
  });
});
