import { describe, expect, it } from "vitest";
import { isSourceType } from "./resume-vector-store";

describe("isSourceType", () => {
  it("接受 job_description", () => {
    expect(isSourceType("job_description")).toBe(true);
  });
});
