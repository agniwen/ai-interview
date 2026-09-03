import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "../../../../../../..");

function readRepoFile(path: string) {
  return readFileSync(resolve(REPO_ROOT, path), "utf-8");
}

describe("platform user remarks", () => {
  it("adds user.remark to schema, migration, and platform user responses", () => {
    expect(readRepoFile("packages/db-schema/src/schema.ts")).toContain('remark: text("remark")');
    expect(readRepoFile("apps/web/drizzle/20260626130000_add_user_remark/migration.sql")).toContain(
      'ALTER TABLE "user" ADD COLUMN "remark" text;',
    );

    const routeSource = readRepoFile("apps/server/src/server/routes/platform/route.ts");
    expect(routeSource).toContain("remark: user.remark");
    expect(routeSource).toContain('"/users/:userId/remark"');

    const hydrationSource = readRepoFile("apps/web/src/lib/start/platform/users.server.ts");
    expect(hydrationSource).toContain("rpc.api.platform.users.$get");
    expect(hydrationSource).not.toContain("remark: user.remark");
  });
});
