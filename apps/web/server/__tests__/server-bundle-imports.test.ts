import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { verifyServerBundleImports } from "../../scripts/server-bundle-imports";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "server-bundle-imports-"));
});
afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});
async function moduleFixture(name: string, suffix = "") {
  const file = path.join(directory, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `var S3Client = class {}; export { S3Client }; ${suffix}`);
  return file;
}

it("verifies a single SDK bundle", async () => {
  const file = await moduleFixture("_ssr/sdk.mjs");
  await expect(verifyServerBundleImports(directory)).resolves.toEqual([file]);
});

it("verifies both SSR and Nitro SDK bundles instead of rejecting their count", async () => {
  const ssr = await moduleFixture("_ssr/sdk.mjs");
  const nitro = await moduleFixture("_libs/sdk.mjs");
  await expect(verifyServerBundleImports(directory)).resolves.toEqual([nitro, ssr]);
});

it("fails if no emitted SDK implementation is found", async () => {
  await writeFile(path.join(directory, "unrelated.mjs"), "export const other = true;");
  await expect(verifyServerBundleImports(directory)).rejects.toThrow("No server bundle");
});

it("does not hide a broken second copy behind a working first copy", async () => {
  await moduleFixture("_libs/sdk.mjs");
  await moduleFixture("_ssr/sdk.mjs", 'throw new Error("broken SDK dependency");');
  await expect(verifyServerBundleImports(directory)).rejects.toMatchObject({
    cause: expect.objectContaining({ message: "broken SDK dependency" }),
    message: "Server bundle import failed: _ssr/sdk.mjs",
  });
});
