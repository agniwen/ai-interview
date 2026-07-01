import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const studioPageFiles = [
  "w.$slug.studio.agent-debug.tsx",
  "w.$slug.studio.dashboard.tsx",
  "w.$slug.studio.departments.tsx",
  "w.$slug.studio.forms.tsx",
  "w.$slug.studio.global-config.tsx",
  "w.$slug.studio.interview-questions.tsx",
  "w.$slug.studio.interviewers.tsx",
  "w.$slug.studio.interviews.$roundId.tsx",
  "w.$slug.studio.interviews.tsx",
  "w.$slug.studio.job-descriptions.tsx",
  "w.$slug.studio.mail-ingest-accounts.tsx",
  "w.$slug.studio.me.tsx",
  "w.$slug.studio.members.tsx",
  "w.$slug.studio.permissions.tsx",
  "w.$slug.studio.resume-pool.tsx",
  "w.$slug.studio.resumes.tsx",
] as const;

describe("studio page containers", () => {
  it("adds the width container inside each studio page route", () => {
    for (const filename of studioPageFiles) {
      const source = readFileSync(new URL(`../${filename}`, import.meta.url), "utf-8");

      expect(source, filename).toContain("container mx-auto max-w-7xl");
    }
  });

  it("does not put the page container on the studio layout route", () => {
    const layoutSource = readFileSync(new URL("../w.$slug.studio.tsx", import.meta.url), "utf-8");

    expect(layoutSource).not.toContain("container mx-auto max-w-7xl");
  });
});
