import { describe, expect, it } from "vitest";
import { deriveJdBindStatus } from "./job-binding";

describe("deriveJdBindStatus", () => {
  it("exactly one matched code → bound", () => {
    expect(deriveJdBindStatus({ hasDefaultJd: false, matchedJobIdCount: 1 })).toBe("bound");
    expect(deriveJdBindStatus({ hasDefaultJd: true, matchedJobIdCount: 1 })).toBe("bound");
  });
  it("two or more matched → ambiguous", () => {
    expect(deriveJdBindStatus({ hasDefaultJd: true, matchedJobIdCount: 2 })).toBe("ambiguous");
  });
  it("zero matched with default JD → fallback", () => {
    expect(deriveJdBindStatus({ hasDefaultJd: true, matchedJobIdCount: 0 })).toBe("fallback");
  });
  it("zero matched without default JD → unmatched", () => {
    expect(deriveJdBindStatus({ hasDefaultJd: false, matchedJobIdCount: 0 })).toBe("unmatched");
  });
});
