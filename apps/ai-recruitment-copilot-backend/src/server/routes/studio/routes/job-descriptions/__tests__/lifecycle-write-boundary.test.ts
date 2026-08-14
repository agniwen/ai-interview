import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("job description lifecycle write boundary", () => {
  it("routes legacy evaluation changes through the upgrade workflow", async () => {
    const source = await readFile(new URL("../route.ts", import.meta.url), "utf-8");

    expect(source).toContain("JOB_LEGACY_REQUIRES_UPGRADE");
    expect(source).toContain('existing.evaluationMode === "legacy"');
    expect(source).toContain("publishedJobOperationalUpdateSchema.safeParse(rawInput)");
  });

  it("guards the draft update with the lifecycle captured before validation", async () => {
    const source = await readFile(new URL("../route.ts", import.meta.url), "utf-8");
    const updateBlock = source.slice(
      source.indexOf("const updatedCurrentLifecycle"),
      source.indexOf("} catch (updateError)"),
    );

    expect(updateBlock).toContain("eq(jobDescription.evaluationMode, existing.evaluationMode)");
    expect(updateBlock).toContain("eq(jobDescription.lifecycleStatus, existing.lifecycleStatus)");
    expect(updateBlock).toContain("if (updated.length === 0)");
    expect(updateBlock.indexOf("if (updated.length === 0)")).toBeLessThan(
      updateBlock.indexOf("delete(jobDescriptionInterviewer)"),
    );
  });

  it("restores both legacy review lifecycles when upgrade publication invalidates a run", async () => {
    const source = await readFile(new URL("../routes/upgrade/dao.ts", import.meta.url), "utf-8");
    const invalidationBlock = source.slice(
      source.indexOf("const invalidatedAttempts"),
      source.indexOf(".returning({ id: studioInterview.id })"),
    );

    expect(invalidationBlock).toContain("resumeScreeningError: null");
    expect(invalidationBlock).toMatch(
      /resumeScreeningStatus:\s*sql`case[\s\S]*resumeEvaluationArtifactMode[\s\S]*'ready'[\s\S]*'idle'/,
    );
  });
});
