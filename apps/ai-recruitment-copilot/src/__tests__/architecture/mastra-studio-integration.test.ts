import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

describe("custom Mastra Studio integration", () => {
  it("keeps the editable Studio source in the application workspace", () => {
    const packageJson = readSource("package.json");
    const workspace = readSource("pnpm-workspace.yaml");
    const studioPackage = readSource("apps/mastra-studio/package.json");

    expect(packageJson).toContain('"mastra:studio:source": "pnpm --filter @arc/mastra-studio dev"');
    expect(packageJson).not.toContain("MASTRA_STUDIO_SOURCE_DIR");
    expect(workspace).toContain('"apps/*"');
    expect(studioPackage).toContain('"name": "@arc/mastra-studio"');
    expect(studioPackage).toContain('"build": "MASTRA_API_PREFIX=/api/platform/mastra');
    expect(studioPackage).toContain('"test": "vitest run"');
    expect(existsSync(path.join(repoRoot, "apps/mastra-studio/src/ee"))).toBe(false);
  });

  it("exposes Studio through a same-origin development proxy", () => {
    const viteConfig = readSource("apps/ai-recruitment-copilot/vite.config.ts");

    expect(viteConfig).toContain('"/internal/mastra-studio"');
    expect(viteConfig).toContain("MASTRA_STUDIO_DEV_URL");
  });

  it("packages the Studio build with the production web output", () => {
    const webPackage = readSource("apps/ai-recruitment-copilot/package.json");
    const copyScript = readSource("apps/ai-recruitment-copilot/scripts/copy-mastra-studio.ts");

    expect(webPackage).toContain('"build:mastra-studio": "pnpm --filter @arc/mastra-studio build"');
    expect(webPackage).toContain('"copy:mastra-studio": "tsx scripts/copy-mastra-studio.ts"');
    expect(webPackage).toContain("pnpm copy:mastra-studio");
    expect(copyScript).toContain('"internal/mastra-studio"');
    expect(copyScript).toContain('".output/public"');
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
