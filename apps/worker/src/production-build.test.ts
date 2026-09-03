import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("worker production build", () => {
  it("does not depend on workspace source packages at runtime", async () => {
    const build = spawnSync("bun", ["run", "build"], {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1" },
    });

    expect(build.status, build.stderr || build.stdout).toBe(0);

    const distDirectory = join(process.cwd(), "dist");
    const distEntries = await readdir(distDirectory);
    const files = distEntries.filter((file) => file.endsWith(".mjs"));
    const externalWorkspaceImports: string[] = [];

    await Promise.all(
      files.map(async (file) => {
        const source = await readFile(join(distDirectory, file), "utf-8");
        if (/\b(?:from\s+|import\()(["'])@app\//u.test(source)) {
          externalWorkspaceImports.push(file);
        }
      }),
    );

    expect(externalWorkspaceImports.toSorted()).toEqual([]);
  });
});
