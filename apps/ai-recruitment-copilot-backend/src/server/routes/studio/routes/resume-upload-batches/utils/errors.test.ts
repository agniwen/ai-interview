import { describe, expect, it } from "vitest";
import { isActiveBatchUniqueViolation } from "./errors";

describe("isActiveBatchUniqueViolation", () => {
  it("detects Drizzle-wrapped active batch unique violations", () => {
    const error = new Error("Failed query");
    error.cause = {
      code: "23505",
      constraint_name: "resume_upload_batch_active_unique_idx",
    };

    expect(isActiveBatchUniqueViolation(error)).toBe(true);
  });
});
