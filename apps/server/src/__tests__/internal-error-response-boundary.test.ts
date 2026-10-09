import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routesRoot = path.resolve(import.meta.dirname, "../routes");
// Never combine a domain/validation response with a later safe 500 response.
const rawInternalErrorResponses = [
  /c\.json\(\s*\{(?:(?!c\.json\()[\s\S]){0,400}?(?:detail|error):\s*(?:error\.message|message|error instanceof Error \? error\.message|String\(error\))(?:(?!c\.json\()[\s\S]){0,400}?\}\s*,\s*(?:500|status(?:\s+as\s+ContentfulStatusCode)?)\s*\)/,
  /c\.json\(\s*\{(?:(?!c\.json\()[\s\S]){0,400}?(?:detail|error):\s*`[^`]*\$\{(?:message|error\.message|String\(error\))\}[^`]*`(?:(?!c\.json\()[\s\S]){0,400}?\}\s*,\s*500\s*\)/,
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
  it.each([
    "c.json({ error: error.message }, 500)",
    "c.json({ detail: message }, status as ContentfulStatusCode)",
    'c.json({ error: error instanceof Error ? error.message : "failed" }, 500)',
    "c.json({ error: String(error) }, 500)",
    // oxlint-disable-next-line no-template-curly-in-string -- This literal is TypeScript source for the leakage detector.
    "c.json({ error: `Failed: ${error.message}` }, 500)",
    // oxlint-disable-next-line no-template-curly-in-string -- This literal is TypeScript source for the leakage detector.
    "c.json({ detail: `${message}` }, 500)",
    // oxlint-disable-next-line no-template-curly-in-string -- This literal is TypeScript source for the leakage detector.
    "c.json({ error: `${String(error)}` }, 500)",
  ])("detects a raw internal-error response: %s", (source) => {
    expect(rawInternalErrorResponses.some((pattern) => pattern.test(source))).toBe(true);
  });

  it.each([
    'c.json({ error: error.message }, 400); c.json({ error: "Operation failed" }, 500)',
    'c.json({ error: error.message }, error.status); c.json({ error: "Operation failed" }, 500)',
    'c.json({ error: error.message }, error.code === "not_found" ? 404 : 409); c.json({ error: "Operation failed" }, 500)',
  ])("does not join separate domain and internal-error responses: %s", (source) => {
    expect(rawInternalErrorResponses.some((pattern) => pattern.test(source))).toBe(false);
  });

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
