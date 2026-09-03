import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(import.meta.dirname, "../../..");
const srcRoot = path.join(appRoot, "src");

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (entry === "__tests__" || entry === "__test__" || entry === "node_modules") {
        return [];
      }
      return listSourceFiles(fullPath);
    }
    if (/\.test\.(ts|tsx)$/u.test(entry) || /\.spec\.(ts|tsx)$/u.test(entry)) {
      return [];
    }
    return /\.(ts|tsx)$/u.test(entry) ? [fullPath] : [];
  });
}

describe("no Next.js runtime leftovers", () => {
  it("does not import next/* or client-only/server-only markers from app source", () => {
    const offenders = listSourceFiles(srcRoot).flatMap((file) => {
      const source = readFileSync(file, "utf-8");
      const hits: string[] = [];
      if (/from\s+["']next\//u.test(source) || /import\s+["']next\//u.test(source)) {
        hits.push(`${path.relative(appRoot, file)}: next/* import`);
      }
      if (
        /from\s+["'](?:client-only|server-only)["']/u.test(source) ||
        /import\s+["'](?:client-only|server-only)["']/u.test(source)
      ) {
        hits.push(`${path.relative(appRoot, file)}: client-only/server-only import`);
      }
      return hits;
    });

    expect(offenders).toEqual([]);
  });
});
