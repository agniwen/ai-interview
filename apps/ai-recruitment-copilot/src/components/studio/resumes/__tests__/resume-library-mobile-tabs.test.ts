import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../../routes/w.$slug.studio.resumes.tsx", import.meta.url),
  "utf-8",
);

describe("ResumeLibraryPage mobile stage tabs", () => {
  it("makes pipeline stage tabs fill the mobile viewport width", () => {
    expect(source).toContain("grid w-full grid-cols-2");
    expect(source).toContain("sm:inline-flex");
    expect(source).toContain("w-full flex-col");
  });
});
