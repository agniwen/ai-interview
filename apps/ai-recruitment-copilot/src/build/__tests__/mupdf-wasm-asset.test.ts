import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  copyMupdfWasmAsset,
  getMupdfWasmOutputPath,
  getMupdfWasmSourcePath,
} from "../mupdf-wasm-asset";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((dir) => fs.rm(dir, { force: true, recursive: true })));
  tempRoots.length = 0;
});

async function makeTempRoot() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "arc-mupdf-wasm-"));
  tempRoots.push(dir);
  return dir;
}

describe("mupdf wasm asset", () => {
  it("resolves the wasm file beside the mupdf entry", () => {
    expect(getMupdfWasmSourcePath("/repo/node_modules/mupdf/dist/mupdf.js")).toBe(
      "/repo/node_modules/mupdf/dist/mupdf-wasm.wasm",
    );
  });

  it("copies the wasm file into the Nitro server libs directory", async () => {
    const appRoot = await makeTempRoot();
    const sourceDir = path.join(appRoot, "node_modules/mupdf/dist");
    const mupdfEntryPath = path.join(sourceDir, "mupdf.js");
    const sourcePath = path.join(sourceDir, "mupdf-wasm.wasm");

    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(mupdfEntryPath, "export {};");
    await fs.writeFile(sourcePath, "wasm-bytes");

    const result = await copyMupdfWasmAsset({ appRoot, mupdfEntryPath });
    const outputPath = getMupdfWasmOutputPath(appRoot);

    await expect(fs.readFile(outputPath, "utf-8")).resolves.toBe("wasm-bytes");
    expect(result).toEqual({ outputPath, sourcePath });
  });
});
