import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(import.meta.dirname, "users-grid.tsx"), "utf-8");

describe("platform user actions", () => {
  it("shows an unban action for banned users", () => {
    expect(source).toContain('label: "解封用户"');
    expect(source).toContain("authClient.admin.unbanUser");
    expect(source).toContain("show: (r) => r.banned");
  });
});
