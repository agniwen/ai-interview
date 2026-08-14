import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const appRoot = path.resolve(import.meta.dirname, "..");
const serverOutput = path.join(appRoot, ".output", "server");
const s3ClientMarker = "var S3Client = class";

async function findModuleWithMarker(directory: string, marker: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const matches: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findModuleWithMarker(entryPath, marker)));
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name) !== ".mjs") {
      continue;
    }
    const source = await readFile(entryPath, "utf-8");
    if (source.includes(marker)) {
      matches.push(entryPath);
    }
  }

  return matches;
}

const [s3ClientModule, ...unexpectedMatches] = await findModuleWithMarker(
  serverOutput,
  s3ClientMarker,
);

if (!s3ClientModule || unexpectedMatches.length > 0) {
  throw new Error(
    `Expected exactly one server bundle containing the S3 client, found ${
      s3ClientModule ? unexpectedMatches.length + 1 : 0
    }.`,
  );
}

await import(pathToFileURL(s3ClientModule).href);
console.log(`Verified server bundle import: ${path.relative(appRoot, s3ClientModule)}`);
