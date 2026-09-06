import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, it } from "vitest";
import { sourceNames, sqlName } from "./model";

const root = resolve(import.meta.dirname, "../../../../..");
const deprecated = new Set(sourceNames);
const oldSql = sourceNames.map(sqlName).join("|");
const rawQuery = new RegExp(
  `\\b(?:FROM|JOIN|UPDATE|INTO|DELETE\\s+FROM)\\s+["\\x60]?(?:${oldSql})\\b`,
  "i",
);

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      ["node_modules", "dist", ".output", ".git", "recruiting-migration", "db-schema"].includes(
        entry.name,
      )
    ) {
      return [];
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return files(path);
    }
    return /\.tsx?$/.test(path) && !/\.(?:test|spec)\.tsx?$/.test(path) ? [path] : [];
  });
}

it("keeps deprecated recruitment tables outside runtime imports and raw SQL", () => {
  const violations: string[] = [];
  for (const file of [...files(join(root, "apps")), ...files(join(root, "packages"))]) {
    const source = readFileSync(file, "utf-8")
      .replaceAll(/\/\*[\s\S]*?\*\//g, "")
      .replaceAll(/^\s*\/\/.*$/gm, "");
    for (const match of source.matchAll(
      /import\s+(?!type\b)\{([^}]+)\}\s+from\s+["']@app\/db-schema[^"']*["']/g,
    )) {
      for (const entry of match[1].split(",")) {
        const [name] = entry.trim().split(/\s+/);
        if (name && deprecated.has(name)) {
          violations.push(`${relative(root, file)} imports ${name}`);
        }
      }
    }
    if (rawQuery.test(source)) {
      violations.push(`${relative(root, file)} contains SQL against a deprecated table`);
    }
  }
  expect(violations).toEqual([]);
});
