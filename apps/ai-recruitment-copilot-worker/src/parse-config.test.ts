import { describe, expect, it } from "vitest";
import { getResumeParseConfigSummary, isResumeParseCacheDisabled } from "./parse-config";

describe("resume parse worker defaults", () => {
  it("keeps resume parse cache reads enabled by default", () => {
    expect(isResumeParseCacheDisabled({})).toBe(false);
    expect(getResumeParseConfigSummary({}).cacheDisabled).toBe(false);
  });

  it("defaults PDF OCR page concurrency to 4", () => {
    expect(getResumeParseConfigSummary({}).ocrPageConcurrency).toBe("4");
  });
});
