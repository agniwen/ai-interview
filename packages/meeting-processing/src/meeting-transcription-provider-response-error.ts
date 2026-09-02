export class MeetingProviderResponseError extends Error {
  readonly code: "malformed-response" | "partial-result";

  constructor(
    code: "malformed-response" | "partial-result",
    provider: string,
    detail?: string | null,
  ) {
    const summary =
      code === "malformed-response"
        ? `${provider} returned a malformed Meeting transcription response`
        : `${provider} returned an incomplete Meeting transcription result`;
    super(detail?.trim() ? `${summary}: ${detail.trim().slice(0, 500)}` : summary);
    this.code = code;
    this.name = "MeetingProviderResponseError";
  }
}
