import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = process.cwd();
const sourceRoot = join(appRoot, "src");
const textExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        return listSourceFiles(path);
      }
      return textExtensions.has(path.slice(path.lastIndexOf("."))) ? [path] : [];
    })
    .toSorted();
}

describe("Tabler icons migration", () => {
  const forbiddenImports = [
    ["lucide", "react"].join("-"),
    "@hugeicons/core-free-icons",
    "@hugeicons/react",
    "@/components/icons/hugeicons",
  ] as const;

  it("does not import previous icon packages from app source", () => {
    const offenders = listSourceFiles(sourceRoot)
      .filter((file) => {
        const content = readFileSync(file, "utf-8");
        return forbiddenImports.some(
          (forbiddenImport) =>
            content.includes(`from "${forbiddenImport}"`) ||
            content.includes(`from '${forbiddenImport}'`) ||
            content.includes(`import("${forbiddenImport}")`) ||
            content.includes(`import('${forbiddenImport}')`),
        );
      })
      .map((file) => relative(appRoot, file));

    expect(offenders).toEqual([]);
  });

  it("does not keep previous icon packages as app dependencies", () => {
    const packageJson = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    for (const forbiddenImport of forbiddenImports) {
      expect(packageJson.dependencies).not.toHaveProperty(forbiddenImport);
      expect(packageJson.devDependencies).not.toHaveProperty(forbiddenImport);
    }
  });
});
