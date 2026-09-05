import { describe, expect, it } from "vitest";
import {
  desktopSettingsSchema,
  meetingTranscriptionProviderCredentialStatusSchema,
} from "./orpc-contract";

describe("desktopSettingsSchema", () => {
  it("carries the persisted transparent background preference", () => {
    expect(
      desktopSettingsSchema.parse({
        deepgramEndpointingMs: 1500,
        meetingLiveTranscriptProvider: "deepgram",
        notifyOnFinish: false,
        theme: "system",
        transparentBackground: false,
      }),
    ).toEqual({
      deepgramEndpointingMs: 1500,
      meetingLiveTranscriptProvider: "deepgram",
      notifyOnFinish: false,
      theme: "system",
      transparentBackground: false,
    });
  });
});

describe("meetingTranscriptionProviderCredentialStatusSchema", () => {
  it("does not expose stored credential values", () => {
    expect(
      meetingTranscriptionProviderCredentialStatusSchema.parse({
        deepgram: true,
        qwen: false,
        secureStorageAvailable: true,
      }),
    ).toEqual({ deepgram: true, qwen: false, secureStorageAvailable: true });
  });
});
