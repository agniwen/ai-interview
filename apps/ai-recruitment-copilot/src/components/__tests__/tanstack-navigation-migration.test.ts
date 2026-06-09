import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack navigation migration", () => {
  it("uses TanStack Router navigation for internal side-effect redirects", () => {
    const sources = [
      readSource("auth/email-password-sign-in-form.tsx"),
      readSource("chat/background-stream-toaster.tsx"),
      readSource("home/use-protected-navigation.ts"),
      readSource("join/join-client.tsx"),
      readSource("select-workspace/user-menu.tsx"),
      readSource("workspace/create-workspace-dialog.tsx"),
      readSource("workspace/workspace-switcher.tsx"),
    ].join("\n");

    expect(sources).toContain("useNavigate");
    expect(sources).not.toMatch(/window\.location\.(assign|replace)\(/u);
  });
});
