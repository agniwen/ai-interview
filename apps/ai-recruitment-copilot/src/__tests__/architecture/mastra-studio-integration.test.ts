import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

describe("custom Mastra Studio integration", () => {
  it("keeps the editable Studio source outside the application workspace", () => {
    const packageJson = readSource("package.json");
    const workspace = readSource("pnpm-workspace.yaml");

    expect(packageJson).toContain('"mastra:studio:source"');
    expect(workspace).not.toContain("mastra-studio");
  });

  it("exposes Studio through a same-origin development proxy", () => {
    const viteConfig = readSource("apps/ai-recruitment-copilot/vite.config.ts");

    expect(viteConfig).toContain('"/internal/mastra-studio"');
    expect(viteConfig).toContain("MASTRA_STUDIO_DEV_URL");
  });

  it("keeps the embedded page behind the platform route boundary", () => {
    const route = readSource("apps/ai-recruitment-copilot/src/routes/platform.mastra-studio.tsx");
    const sidebar = readSource(
      "apps/ai-recruitment-copilot/src/components/features/platform/platform-sidebar-slots.tsx",
    );

    expect(route).toContain('createFileRoute("/platform/mastra-studio")');
    expect(route).toContain("MastraStudioPage");
    expect(sidebar).toContain('path: "/platform/mastra-studio"');
  });
});
