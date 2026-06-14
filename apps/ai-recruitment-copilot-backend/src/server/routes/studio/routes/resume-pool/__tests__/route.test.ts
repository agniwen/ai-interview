import { describe, expect, it } from "vitest";
import { resumePoolImportInputSchema } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/schema";

describe("resumePoolImportInputSchema", () => {
  it("requires a job description id in bind mode", () => {
    const result = resumePoolImportInputSchema.safeParse({
      dedupPolicy: "check",
      jobDescriptionId: null,
      jobDescriptionMode: "bind",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("绑定岗位时必须选择岗位。");
  });

  it("normalizes jobDescriptionId to null in none mode", () => {
    const result = resumePoolImportInputSchema.parse({
      dedupPolicy: "force",
      jobDescriptionId: "jd_should_be_ignored",
      jobDescriptionMode: "none",
    });

    expect(result.jobDescriptionId).toBeNull();
  });
});
