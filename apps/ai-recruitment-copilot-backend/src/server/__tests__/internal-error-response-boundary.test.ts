import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routesRoot = path.resolve(import.meta.dirname, "../routes");
const rawInternalErrorResponses = [
  /c\.json\(\s*\{[\s\S]{0,400}?(?:detail|error):\s*(?:error\.message|message|error instanceof Error \? error\.message|String\(error\))[\s\S]{0,400}?\}\s*,\s*(?:500|status(?:\s+as\s+ContentfulStatusCode)?)\s*\)/,
  /c\.json\(\s*\{[\s\S]{0,400}?(?:detail|error):\s*`[^`]*\$\{(?:message|error\.message|String\(error\))\}[^`]*`[\s\S]{0,400}?\}\s*,\s*500\s*\)/,
];

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [entryPath]
      : [];
  });
}

describe("internal error response boundary", () => {
  it("never returns raw internal error messages from 500 handlers", () => {
    const violations = listTypeScriptFiles(routesRoot).flatMap((file) => {
      const source = readFileSync(file, "utf-8");
      return rawInternalErrorResponses.some((pattern) => pattern.test(source))
        ? [path.relative(routesRoot, file)]
        : [];
    });

    expect(violations).toEqual([]);
  });
});
