import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("job description lifecycle write boundary", () => {
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
});
