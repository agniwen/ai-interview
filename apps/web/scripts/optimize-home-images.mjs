import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const appRoot = path.resolve(import.meta.dirname, "..");
const landingRoot = path.join(appRoot, "public", "landing");
const outputRoot = path.join(landingRoot, "optimized");

const images = [
  "multicolor/talent-city-grain-light.jpg",
  "multicolor/talent-city-grain-dark.jpg",
  "multicolor/evidence-review-light.jpg",
  "multicolor/evidence-review-dark.jpg",
  "multicolor/interview-conversation-light.jpg",
  "multicolor/interview-conversation-dark.jpg",
  "multicolor/team-calibration-light.jpg",
  "multicolor/team-calibration-dark.jpg",
  "multicolor/recruitment-workflow-light.jpg",
  "multicolor/recruitment-workflow-dark.jpg",
];

const formatters = {
  avif: (pipeline) => pipeline.avif({ effort: 6, quality: 72 }),
  webp: (pipeline) => pipeline.webp({ effort: 6, quality: 88, smartSubsample: true }),
};

const formatBytes = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

async function encode(sourcePath, outputPath, format, width) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const pipeline = sharp(sourcePath).rotate();
  if (width) {
    pipeline.resize({ width, withoutEnlargement: true });
  }
  await formatters[format](pipeline).toFile(outputPath);
  const outputStats = await stat(outputPath);
  return outputStats.size;
}

async function encodeHero(sourcePath, outputPath, format) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(sourcePath).rotate().toFormat(format, { effort: 6, quality: 90 }).toFile(outputPath);
  const outputStats = await stat(outputPath);
  return outputStats.size;
}

async function createModernFormats(relativePath) {
  const sourcePath = path.join(landingRoot, relativePath);
  const parsed = path.parse(relativePath);
  const outputBase = path.join(outputRoot, parsed.dir, parsed.name);
  const metadata = await sharp(sourcePath).metadata();
  const sourceStats = await stat(sourcePath);

  for (const format of Object.keys(formatters)) {
    const outputPath = `${outputBase}.${format}`;
    const outputSize = parsed.name.startsWith("talent-city")
      ? await encodeHero(sourcePath, outputPath, format)
      : await encode(sourcePath, outputPath, format);
    console.log(`${path.relative(landingRoot, outputPath)} ${formatBytes(outputSize)}`);
  }
  console.log(`${relativePath} source ${formatBytes(sourceStats.size)}`);

  const width = parsed.name.startsWith("talent-city") ? 1280 : 1024;
  if (!parsed.name.startsWith("talent-city") && metadata.width > width) {
    const outputPath = `${outputBase}-${width}.avif`;
    const outputSize = await encode(sourcePath, outputPath, "avif", width);
    console.log(`${path.relative(landingRoot, outputPath)} ${formatBytes(outputSize)}`);
  }
}

for (const relativePath of images) {
  await createModernFormats(relativePath);
}
