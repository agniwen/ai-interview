import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../../../../../../..");
const sourceRoots = [
  "packages/db-schema/src",
  "packages/shared/src",
  "apps/server/src",
  "apps/web/src",
].map((root) => path.join(repoRoot, root));

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = path.join(directory, entry);
    if (statSync(absolutePath).isDirectory()) {
      return entry === "__tests__" ? [] : listSourceFiles(absolutePath);
    }
    return /\.(ts|tsx)$/u.test(entry) && !/\.test\.(ts|tsx)$/u.test(entry) ? [absolutePath] : [];
  });
}

describe("candidate lifecycle status boundary", () => {
  it("keeps the removed candidate status out of production TypeScript", () => {
    const forbidden = /StudioInterviewStatus|studioInterviewStatus|studioInterview\.status/u;
    const matches = sourceRoots.flatMap((root) =>
      listSourceFiles(root)
        .filter((file) => forbidden.test(readFileSync(file, "utf-8")))
        .map((file) => path.relative(repoRoot, file)),
    );

    expect(matches).toEqual([]);
  });

  it("ships a deployment-safe expand-contract migration", () => {
    const migration = readFileSync(
      path.join(
        repoRoot,
        "apps/web/drizzle/20260710151000_retire_legacy_studio_interview_status/migration.sql",
      ),
      "utf-8",
    );

    expect(migration).toContain("ALTER COLUMN \"status\" SET DEFAULT 'draft'");
    expect(migration).not.toContain('DROP COLUMN IF EXISTS "status"');
  });

  it("keeps AI Interview Round lifecycle writes off the candidate row", () => {
    const candidateRoute = readFileSync(
      path.join(repoRoot, "apps/server/src/server/routes/interview/route.ts"),
      "utf-8",
    );
    const agentRoute = readFileSync(
      path.join(repoRoot, "apps/server/src/server/routes/agent/route-runtime.ts"),
      "utf-8",
    );

    expect(candidateRoute).not.toContain(".update(studioInterview)");
    expect(agentRoute).not.toContain(".update(studioInterview)");
    expect(candidateRoute).toContain(".update(studioInterviewSchedule)");
    expect(agentRoute).toContain(".update(studioInterviewSchedule)");
  });
});
