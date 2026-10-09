import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const nitroRoot = path.resolve(import.meta.dirname, "..");

function findTests(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return findTests(file);
    }
    return /\.(?:test|spec)\./u.test(entry.name) ? [path.relative(nitroRoot, file)] : [];
  });
}

it("keeps tests outside Nitro runtime discovery directories", () => {
  // Nitro auto-discovers runtime files here; a colocated route test previously
  // became a production endpoint and pulled Vitest into the server bundle.
  const discoveredTests = ["routes", "plugins", "utils"].flatMap((directory) =>
    findTests(path.join(nitroRoot, directory)),
  );

  expect(discoveredTests).toEqual([]);
});
