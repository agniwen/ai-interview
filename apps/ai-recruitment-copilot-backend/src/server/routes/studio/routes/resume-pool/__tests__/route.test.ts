import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resumePoolImportInputSchema } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/schema";

const routeSource = readFileSync(fileURLToPath(new URL("../route.ts", import.meta.url)), "utf-8");

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

describe("resume pool create duplicate handling", () => {
  it("records duplicate matches after creating a private pool item", () => {
    expect(routeSource).toContain("findSemanticResumeDuplicates");
    expect(routeSource).toContain("replaceDuplicateMatchesForSource");
    expect(routeSource).toContain('sourceType: "resume_pool_item"');
    expect(routeSource).toContain('"studio_interview", "resume_pool_item"');
  });

  it("exposes duplicate match details for badge clicks", () => {
    expect(routeSource).toContain('"/:id/duplicate-matches"');
    expect(routeSource).toContain("listDuplicateMatchesForSource");
  });
});
