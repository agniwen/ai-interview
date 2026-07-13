import { describe, expect, it } from "vitest";
import {
  buildResumeSemanticIndexJobId,
  resumeSemanticIndexJobSchema,
} from "./resume-semantic-index";

describe("resume semantic index queue payload", () => {
  it("validates semantic index jobs", () => {
    expect(
      resumeSemanticIndexJobSchema.parse({
        organizationId: "org-1",
        sourceId: "candidate-1",
        sourceType: "studio_interview",
      }),
    ).toEqual({
      organizationId: "org-1",
      sourceId: "candidate-1",
      sourceType: "studio_interview",
    });
  });

  it("builds stable job ids by source", () => {
    expect(
      buildResumeSemanticIndexJobId({
        sourceId: "candidate:1",
        sourceType: "studio_interview",
      }),
    ).toBe("studio_interview-candidate-1");
  });

  it("accepts job_description sourceType", () => {
    const parsed = resumeSemanticIndexJobSchema.parse({
      organizationId: "org-1",
      sourceId: "jd-1",
      sourceType: "job_description",
    });
    expect(parsed.sourceType).toBe("job_description");
  });
});
