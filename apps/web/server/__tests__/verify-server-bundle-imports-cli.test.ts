import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "ssr-import-check-cli-"));
  await mkdir(path.join(directory, "scripts"));
  await mkdir(path.join(directory, ".output/server/_ssr"), { recursive: true });
  for (const name of ["server-bundle-imports.ts", "verify-server-bundle-imports.ts"]) {
    await copyFile(
      new URL(`../../scripts/${name}`, import.meta.url),
      path.join(directory, "scripts", name),
    );
  }
});
afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});

async function runCheck(suffix = "") {
  await writeFile(
    path.join(directory, ".output/server/_ssr/router.mjs"),
    `var S3Client = class {}; export function getRouter() {};
     setInterval(() => {}, 1000); ${suffix}`,
  );
  return spawnSync("bun", ["scripts/verify-server-bundle-imports.ts"], {
    cwd: directory,
    encoding: "utf-8",
    timeout: 3000,
  });
}

it("exits successfully after checking imports that leave background handles alive", async () => {
  const result = await runCheck();
  expect(result.stdout).toContain("Verified server bundle import: .output/server/_ssr/router.mjs");
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
});

it("exits unsuccessfully when an import fails even with background handles alive", async () => {
  const result = await runCheck('throw new Error("broken router dependency");');
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("broken router dependency");
  expect(result.stdout).not.toContain("Verified server bundle import");
});
