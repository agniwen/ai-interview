export class MeetingProviderResponseError extends Error {
  readonly code: "malformed-response" | "partial-result";

  constructor(code: "malformed-response" | "partial-result", provider: string) {
    super(
      code === "malformed-response"
        ? `${provider} returned a malformed Meeting transcription response`
        : `${provider} returned an incomplete Meeting transcription result`,
    );
    this.code = code;
    this.name = "MeetingProviderResponseError";
  }
}
