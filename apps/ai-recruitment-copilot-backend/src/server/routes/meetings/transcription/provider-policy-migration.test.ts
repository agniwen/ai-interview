import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../../../../../../ai-recruitment-copilot/drizzle/20260809158000_meeting_transcription_provider_policy/migration.sql",
  import.meta.url,
);

describe("Meeting transcription provider policy migration", () => {
  it("backfills legacy reasons before enforcing fallback and reason invariants", async () => {
    const sql = await readFile(migrationUrl, "utf-8");

    expect(sql).toContain('ADD COLUMN "fallback_provider" text');
    expect(sql).toContain('ADD COLUMN "selection_reason" text');
    expect(sql.indexOf('UPDATE "meeting_transcription_policy"')).toBeLessThan(
      sql.indexOf('ADD CONSTRAINT "meeting_transcription_policy_reason_check"'),
    );
    expect(sql).toContain('"selection_reason" IS NOT NULL');
    expect(sql).toContain('"fallback_provider" <> "selected_provider"');
  });
});
