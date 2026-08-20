import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "../ai-recruitment-copilot/drizzle/20260820073545_mail_resume_auto_job_matching/migration.sql",
  ),
  "utf-8",
);

describe("mail resume automatic job matching migration", () => {
  it("adds the new-mail opt-in marker without backfilling historical rows", () => {
    expect(migration).toContain('ADD COLUMN "job_match_requested_at" timestamp with time zone');
    expect(migration).not.toMatch(/\bUPDATE\s+"?(resume_upload_batch|resume_pool_item)"?/iu);
    expect(migration).not.toMatch(/job_match_requested_at[^;]*DEFAULT/iu);
  });

  it("makes auto the database default for newly-created mail accounts", () => {
    expect(migration).toContain("ALTER COLUMN \"jd_mode\" SET DEFAULT 'auto'");
  });
});
