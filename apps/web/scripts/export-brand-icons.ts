import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Run on macOS with Xcode's Icon Composer installed: bun scripts/export-brand-icons.ts
const webRoot = fileURLToPath(new URL("../", import.meta.url));
const developerRoot = execFileSync("xcode-select", ["-p"], { encoding: "utf-8" }).trim();
const iconTool = join(
  dirname(developerRoot),
  "Applications/Icon Composer.app/Contents/Executables/ictool",
);
const composerRender = join(webRoot, "assets/icon-composer/app-composer.png");

execFileSync(iconTool, [
  join(webRoot, "assets/icon-composer/app.icon"),
  "--export-image",
  "--output-file",
  composerRender,
  "--platform",
  "macOS",
  "--rendition",
  "Default",
  "--width",
  "1024",
  "--height",
  "1024",
  "--scale",
  "1",
  "--design-generation",
  "27",
]);

await sharp(composerRender)
  .resize(256, 256)
  .toColourspace("srgb")
  .png()
  .toFile(join(webRoot, "public/logo.png"));

// ICO supports PNG frames; include native sizes so small browser tabs stay crisp.
const sizes = [16, 32, 48, 64, 128, 256];
const frames = await Promise.all(
  sizes.map((size) =>
    sharp(composerRender).resize(size, size).toColourspace("srgb").png().toBuffer(),
  ),
);
const directory = Buffer.alloc(6 + frames.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(frames.length, 4);
let offset = directory.length;

for (const [index, frame] of frames.entries()) {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index] === 256 ? 0 : sizes[index];
  directory[entry + 1] = directory[entry];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
}

writeFileSync(join(webRoot, "public/favicon.ico"), Buffer.concat([directory, ...frames]));
