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
      readSource("features/auth/email-password-sign-in-form.tsx"),
      readSource("features/chat/background-stream-toaster.tsx"),
      readSource("features/home/use-protected-navigation.ts"),
      readSource("features/join/join-client.tsx"),
      readSource("features/select-workspace/user-menu.tsx"),
      readSource("features/workspace/create-workspace-dialog.tsx"),
      readSource("features/workspace/workspace-switcher.tsx"),
    ].join("\n");

    expect(sources).toContain("useNavigate");
    expect(sources).not.toMatch(/window\.location\.(assign|replace)\(/u);
  });
});
