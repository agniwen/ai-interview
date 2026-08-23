import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const appRoot = path.resolve(import.meta.dirname, "..");
const landingRoot = path.join(appRoot, "public", "landing");
const outputRoot = path.join(landingRoot, "optimized");

const images = [
  "home-background-options/mixed-media-k-talent-city-4k-light.jpg",
  "home-background-options/mixed-media-k-talent-city-4k-dark.jpg",
  "feature-scenes/evidence-review-v2.jpg",
  "feature-scenes/evidence-review-dark-v2.jpg",
  "feature-scenes/interview-conversation.jpg",
  "feature-scenes/interview-conversation-dark.jpg",
  "feature-scenes/team-calibration.jpg",
  "feature-scenes/team-calibration-dark.jpg",
  "process-scenes/recruitment-workflow-v2-light.jpg",
  "process-scenes/recruitment-workflow-v2-dark.jpg",
];

const formatters = {
  avif: (pipeline) => pipeline.avif({ effort: 6, quality: 72 }),
  webp: (pipeline) => pipeline.webp({ effort: 6, quality: 88, smartSubsample: true }),
};

const formatBytes = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

async function encode(sourcePath, outputPath, format) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const pipeline = sharp(sourcePath).rotate();
  await formatters[format](pipeline).toFile(outputPath);
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
    const outputSize = await encode(sourcePath, outputPath, format);
    console.log(`${path.relative(landingRoot, outputPath)} ${formatBytes(outputSize)}`);
  }
  console.log(`${relativePath} source ${formatBytes(sourceStats.size)}`);

  if (metadata.width) {
    for (const width of [640, 960, metadata.width]) {
      for (const format of ["avif", "jpg", "webp"]) {
        await rm(`${outputBase}-${width}.${format}`, { force: true });
      }
    }
  }
}

for (const relativePath of images) {
  await createModernFormats(relativePath);
}
