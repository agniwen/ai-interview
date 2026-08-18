import { describe, expect, it } from "vitest";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { describeInterviewers } from "./job-description-select-field";

describe("describeInterviewers", () => {
  it("treats an omitted interviewer list from a stale response as unconfigured", () => {
    // SAFETY: Intentionally models an older API payload that predates the required interviewerIds field.
    const jobDescription = {
      id: "job-1",
      name: "产品经理",
    } as JobDescriptionListRecord;

    expect(describeInterviewers(jobDescription)).toBe("未配置面试官");
  });
});
