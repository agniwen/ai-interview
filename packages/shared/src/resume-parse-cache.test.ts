import { describe, expect, it } from "vitest";
import { resumeParseCacheFilterSchema } from "./resume-parse-cache";

describe("resume parse cache filters", () => {
  it("provides stable defaults for the shared platform filter contract", () => {
    expect(resumeParseCacheFilterSchema.parse({})).toEqual({
      cacheType: "all",
      parsedStatus: "all",
      textSource: "all",
    });
  });

  it("rejects values outside the server API filter vocabulary", () => {
    expect(resumeParseCacheFilterSchema.safeParse({ cacheType: "raw" }).success).toBe(false);
  });
});
