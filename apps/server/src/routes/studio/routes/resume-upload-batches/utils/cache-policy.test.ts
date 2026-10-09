import { describe, expect, it } from "vitest";
import { isResumeParseCacheEnabled } from "./cache-policy";

describe("isResumeParseCacheEnabled", () => {
  it("keeps resume parse cache enabled by default", () => {
    expect(isResumeParseCacheEnabled({})).toBe(true);
  });

  it("disables resume parse cache when explicitly requested", () => {
    expect(isResumeParseCacheEnabled({ RESUME_PARSE_DISABLE_CACHE: "true" })).toBe(false);
    expect(isResumeParseCacheEnabled({ RESUME_PARSE_DISABLE_CACHE: "1" })).toBe(false);
    expect(isResumeParseCacheEnabled({ RESUME_PARSE_DISABLE_CACHE: "yes" })).toBe(false);
  });
});
