import { describe, expect, it } from "vitest";
import {
  canonicalMeetingTranscriptSchema,
  createMeetingLiveTranscriptAuthorizationSchema,
  createMeetingTranscriptCorrectionSchema,
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

  it("requires the selected provider to be explicitly allowed", () => {
    expect(
      updateMeetingTranscriptionPolicySchema.safeParse({
        allowedProviders: [],
        selectedProvider: "openai",
      }).success,
    ).toBe(false);
    expect(
      updateMeetingTranscriptionPolicySchema.parse({
        allowedProviders: ["openai"],
        selectedProvider: "openai",
      }),
    ).toEqual({ allowedProviders: ["openai"], selectedProvider: "openai" });
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
