import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../../../../packages/db-schema/src/schema.ts", import.meta.url),
  "utf-8",
);

describe("resumeDuplicateMatch schema", () => {
  it("stores status, similarity, updatedAt and a source-target unique key", () => {
    expect(source).toContain(
      'export type ResumeDuplicateMatchStatus = "active" | "confirmed" | "dismissed";',
    );
    expect(source).toContain('status: text("status").$type<ResumeDuplicateMatchStatus>()');
    expect(source).toContain('similarity: jsonb("similarity")');
    expect(source).toContain('updatedAt: timestamp("updated_at", { withTimezone: true })');
    expect(source).toContain('uniqueIndex("resume_duplicate_match_source_target_version_uq")');
  });
});
