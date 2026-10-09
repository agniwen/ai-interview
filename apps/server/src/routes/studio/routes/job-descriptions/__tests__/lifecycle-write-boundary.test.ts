import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("job description lifecycle write boundary", () => {
  it("saves new jobs directly as published qualitative jobs with an immutable snapshot", async () => {
    const source = await readFile(new URL("../route.ts", import.meta.url), "utf-8");
    const createBlock = source.slice(
      source.indexOf('.post(\n      "/",'),
      source.indexOf('.post(\n      "/:id/evaluation-blueprint-preview"'),
    );

    expect(createBlock).toContain('zValidator("json", jobDescriptionSaveSchema');
    expect(createBlock).toContain('evaluationMode: "qualitative"');
    expect(createBlock).toContain('lifecycleStatus: "published"');
    expect(createBlock).toContain("await tx.insert(jobDescriptionVersion).values");
    expect(createBlock).toContain("version: 1");
  });

  it("serializes saves and appends a new immutable JD snapshot", async () => {
    const source = await readFile(new URL("../route.ts", import.meta.url), "utf-8");
    const updateBlock = source.slice(
      source.indexOf('.patch(\n      "/:id",'),
      source.indexOf('.delete("/:id"'),
    );

    expect(updateBlock).toContain('.for("update")');
    expect(updateBlock).toContain('evaluationMode: "qualitative"');
    expect(updateBlock).toContain('lifecycleStatus: "published"');
    expect(updateBlock).toContain("await tx.insert(jobDescriptionVersion).values");
    expect(updateBlock).toContain("version: (latest?.version ?? 0) + 1");
    expect(updateBlock.indexOf('.for("update")')).toBeLessThan(
      updateBlock.indexOf("update(jobDescription)"),
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
