import { describe, expect, it } from "vitest";
import { auditDescription } from "./timeline-audit";

describe("auditDescription", () => {
  it("accepts persisted nullable audit fields", () => {
    expect(
      auditDescription(
        {
          fromJobDescriptionId: null,
          fromJobDescriptionName: null,
          reason: null,
          toJobDescriptionId: null,
          toJobDescriptionName: null,
        },
        "resume_evaluation_reset_for_job_change",
      ),
    ).toBe("岗位变更后需重新评估");
  });
});
