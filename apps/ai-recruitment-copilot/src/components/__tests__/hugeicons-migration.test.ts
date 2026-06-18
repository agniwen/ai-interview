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

describe("Hugeicons migration", () => {
  const forbiddenPackage = ["lucide", "react"].join("-");

  it("does not import the previous icon package from app source", () => {
    const offenders = listSourceFiles(sourceRoot)
      .filter((file) => {
        const content = readFileSync(file, "utf-8");
        return (
          content.includes(`"${forbiddenPackage}"`) || content.includes(`'${forbiddenPackage}'`)
        );
      })
      .map((file) => relative(appRoot, file));

    expect(offenders).toEqual([]);
  });

  it("does not keep the previous icon package as an app dependency", () => {
    const packageJson = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).not.toHaveProperty(forbiddenPackage);
    expect(packageJson.devDependencies).not.toHaveProperty(forbiddenPackage);
  });
});
