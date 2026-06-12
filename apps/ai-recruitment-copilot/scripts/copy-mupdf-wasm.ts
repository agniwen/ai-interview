import path from "node:path";
import { createRequire } from "node:module";
import { copyMupdfWasmAsset } from "../src/build/mupdf-wasm-asset";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, "..");
const mupdfEntryPath = require.resolve("mupdf");

const { outputPath } = await copyMupdfWasmAsset({ appRoot, mupdfEntryPath });

console.log(`Copied MuPDF WASM asset to ${path.relative(appRoot, outputPath)}`);
