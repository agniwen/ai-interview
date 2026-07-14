import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const webRoot = path.resolve(import.meta.dirname, "..");
const studioDist = path.resolve(webRoot, "../mastra-studio/dist");
const outputRoot = path.join(webRoot, ".output/public");
const outputPath = path.join(outputRoot, "internal/mastra-studio");

await stat(path.join(studioDist, "index.html"));
await rm(outputPath, { force: true, recursive: true });
await mkdir(path.dirname(outputPath), { recursive: true });
await cp(studioDist, outputPath, { recursive: true });

console.log(`Copied Mastra Studio to ${path.relative(webRoot, outputPath)}`);
