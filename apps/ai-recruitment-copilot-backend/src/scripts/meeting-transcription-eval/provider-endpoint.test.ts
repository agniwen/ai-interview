import { describe, expect, it } from "vitest";
import { resolveMeetingTranscriptionBenchmarkEndpoint } from "./provider-endpoint";

describe("Meeting transcription benchmark endpoint evidence", () => {
  it("derives region evidence from the actual known endpoint", () => {
    expect(
      resolveMeetingTranscriptionBenchmarkEndpoint({
        baseUrl: "https://api.eu.deepgram.com/",
        provider: "deepgram",
      }),
    ).toEqual({ baseUrl: "https://api.eu.deepgram.com", region: "deepgram-eu" });
    expect(
      resolveMeetingTranscriptionBenchmarkEndpoint({
        baseUrl: "https://api.openai.com/v1",
        provider: "openai",
      }).region,
    ).toBe("openai-default");
  });

  it("marks custom endpoints unverified instead of accepting a claimed region", () => {
    expect(
      resolveMeetingTranscriptionBenchmarkEndpoint({
        baseUrl: "https://proxy.example/v1",
        provider: "openai",
      }).region,
    ).toBe("openai-custom-unverified");
  });
});
