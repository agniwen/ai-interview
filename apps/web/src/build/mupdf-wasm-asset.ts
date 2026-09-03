import fs from "node:fs/promises";
import path from "node:path";

const MUPDF_WASM_FILENAME = "mupdf-wasm.wasm";

export function getMupdfWasmSourcePath(mupdfEntryPath: string) {
  return path.join(path.dirname(mupdfEntryPath), MUPDF_WASM_FILENAME);
}

export function getMupdfWasmOutputPath(appRoot: string) {
  return path.join(appRoot, ".output", "server", "_libs", MUPDF_WASM_FILENAME);
}

export async function copyMupdfWasmAsset({
  appRoot,
  mupdfEntryPath,
}: {
  appRoot: string;
  mupdfEntryPath: string;
}) {
  const sourcePath = getMupdfWasmSourcePath(mupdfEntryPath);
  const outputPath = getMupdfWasmOutputPath(appRoot);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.copyFile(sourcePath, outputPath);

  return { outputPath, sourcePath };
}
