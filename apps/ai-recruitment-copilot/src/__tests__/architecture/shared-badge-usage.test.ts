import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(import.meta.dirname, "../../..");
const componentsRoot = path.join(appRoot, "src/components");
const excludedDirectories = new Set(["agents-ui", "react-bits", "spell-ui", "ui", "upstream"]);
const allowedCustomLabels = new Set([
  "src/components/features/home/screens/chat-screen.tsx",
  "src/components/features/studio/forms/form-template-editor-dialog.tsx",
]);

function listComponentFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      return excludedDirectories.has(entry) ? [] : listComponentFiles(fullPath);
    }
    return entry.endsWith(".tsx") ? [fullPath] : [];
  });
}

describe("shared Badge usage", () => {
  it("does not hand-roll badge-shaped text spans", () => {
    const offenders = listComponentFiles(componentsRoot).flatMap((file) => {
      const relativePath = path.relative(appRoot, file);
      if (allowedCustomLabels.has(relativePath)) {
        return [];
      }

      const source = readFileSync(file, "utf-8");
      const spanPattern = /<span\b[^>]*className=(?:"([^"]*)"|\{`([^`]*)`\})[^>]*>/gsu;
      return [...source.matchAll(spanPattern)].flatMap((match) => {
        const classes = match[1] ?? match[2] ?? "";
        const isBadgeShaped =
          /\brounded-(?:full|sm|md|lg)\b/u.test(classes) &&
          /\bpx-/u.test(classes) &&
          /\bpy-/u.test(classes) &&
          /\b(?:text-xs|text-\[10px\])\b/u.test(classes) &&
          /\b(?:border|bg-)/u.test(classes);
        return isBadgeShaped ? [`${relativePath}: ${classes.trim()}`] : [];
      });
    });

    expect(offenders).toEqual([]);
  });
});
