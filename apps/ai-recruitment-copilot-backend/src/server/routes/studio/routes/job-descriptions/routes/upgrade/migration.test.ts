import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../../../../../../../..");
const migration = readFileSync(
  path.join(
    repoRoot,
    "apps/ai-recruitment-copilot/drizzle/20260804110000_legacy_job_structured_upgrade/migration.sql",
  ),
  "utf-8",
);

describe("legacy job structured upgrade migration", () => {
  it("backfills candidate artifact mode from actual results instead of the current job mode", () => {
    const artifactBackfill = migration.match(
      /UPDATE "studio_interview"\s+SET "resume_evaluation_artifact_mode"[\s\S]*?END;/u,
    )?.[0];

    expect(artifactBackfill).toContain('"structured_resume_evaluation" IS NOT NULL');
    expect(artifactBackfill).toContain('"resume_review" IS NOT NULL');
    expect(artifactBackfill).not.toContain('"evaluation_mode"');
  });

  it("keeps an unknown in-flight attempt mode nullable instead of guessing", () => {
    const attemptBackfill = migration.match(
      /UPDATE "studio_interview"\s+SET "resume_evaluation_attempt_mode"[\s\S]*?END;/u,
    )?.[0];

    expect(attemptBackfill).toContain("ELSE NULL");
    expect(attemptBackfill).not.toContain('JOIN "job_description"');
  });

  it("adds optimistic version and complete-preview constraints to upgrade drafts", () => {
    expect(migration).toContain(
      'CONSTRAINT "job_description_evaluation_upgrade_draft_job_uq" UNIQUE("job_description_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "job_description_evaluation_upgrade_draft_version_check" CHECK ("version" > 0)',
    );
    expect(migration).toContain(
      'CONSTRAINT "job_description_evaluation_upgrade_draft_preview_check" CHECK',
    );
  });
});
