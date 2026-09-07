import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const s3ClientMarker = "var S3Client = class";

async function findModulesWithMarker(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const matches: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findModulesWithMarker(entryPath)));
    } else if (entry.isFile() && path.extname(entry.name) === ".mjs") {
      const source = await readFile(entryPath, "utf-8");
      if (source.includes(s3ClientMarker)) {
        matches.push(entryPath);
      }
    }
  }
  return matches;
}

export async function verifyServerBundleImports(serverOutput: string): Promise<string[]> {
  const matches = await findModulesWithMarker(serverOutput);
  const modules = matches.toSorted();
  if (modules.length === 0) {
    throw new Error(`No server bundle containing the S3 client found in ${serverOutput}`);
  }
  // Vite SSR and Nitro dependencies can each emit the SDK. Chunk count is not
  // an import-safety invariant: every emitted copy must load successfully.
  for (const modulePath of modules) {
    try {
      await import(pathToFileURL(modulePath).href);
    } catch (error) {
      throw new Error(`Server bundle import failed: ${path.relative(serverOutput, modulePath)}`, {
        cause: error,
      });
    }
  }
  return modules;
}
