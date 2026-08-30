import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schemaSource = readFileSync(
  new URL("../../../../../../../../../packages/db-schema/src/schema.ts", import.meta.url),
  "utf-8",
);
const migrationSource = readFileSync(
  new URL(
    "../../../../../../../../../apps/web/drizzle/20260625160000_add_resume_text/migration.sql",
    import.meta.url,
  ),
  "utf-8",
);
const sharedResumePoolSource = readFileSync(
  new URL("../../../../../../../../../packages/shared/src/resume-pool.ts", import.meta.url),
  "utf-8",
);
const sharedStudioResumesSource = readFileSync(
  new URL("../../../../../../../../../packages/shared/src/studio-resumes.ts", import.meta.url),
  "utf-8",
);

describe("resume OCR text storage boundary", () => {
  it("keeps OCR text in private storage without exposing it in shared DTOs", () => {
    expect(schemaSource.match(/resumeText: text\("resume_text"\)/gu)).toHaveLength(2);
    expect(migrationSource).toContain(
      'ALTER TABLE "studio_interview" ADD COLUMN "resume_text" text;',
    );
    expect(migrationSource).toContain(
      'ALTER TABLE "resume_pool_item" ADD COLUMN "resume_text" text;',
    );
    expect(sharedStudioResumesSource).not.toContain("resumeText");
    expect(sharedResumePoolSource).not.toContain("resumeText");
  });
});
