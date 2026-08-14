import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../../../ai-recruitment-copilot/drizzle/20260809157000_meeting_operations_capacity/migration.sql",
    import.meta.url,
  ),
  "utf-8",
);

describe("Meeting direct-upload capacity migration", () => {
  it("conservatively retains outstanding upload authority across lifecycle states", () => {
    expect(migration).toContain("\"status\" = 'uploading'");
    expect(migration).toContain("\"status\" IN ('trashed', 'purging')");
    expect(migration).toContain("\"trashed_from_status\" = 'uploading'");
    expect(migration).toContain("interval '121 minutes'");
  });
});
