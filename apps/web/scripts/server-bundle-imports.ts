import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const s3ClientMarker = "var S3Client = class";

async function findModulesWithMarker(directory: string, marker: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const matches: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findModulesWithMarker(entryPath, marker)));
    } else if (entry.isFile() && path.extname(entry.name) === ".mjs") {
      const source = await readFile(entryPath, "utf-8");
      if (source.includes(marker)) {
        matches.push(entryPath);
      }
    }
  }
  return matches;
}

export async function verifyServerBundleImports(serverOutput: string): Promise<string[]> {
  const s3Modules = await findModulesWithMarker(serverOutput, s3ClientMarker);
  if (s3Modules.length === 0) {
    throw new Error(`No server bundle containing the S3 client found in ${serverOutput}`);
  }
  const routerModules = await findModulesWithMarker(serverOutput, "function getRouter()");
  if (routerModules.length === 0) {
    throw new Error(`No server router entry found in ${serverOutput}`);
  }
  const modules = [...new Set([...s3Modules, ...routerModules])].toSorted();
  // Import the actual router graph as well as every S3 SDK copy. Shared
  // production chunks can make a browser-only dependency load eagerly during SSR.
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
