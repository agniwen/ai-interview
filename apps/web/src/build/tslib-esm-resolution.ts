const TSLIB_ESM_IMPORTER_SEGMENTS = [
  "/node_modules/@aws-crypto/",
  "/node_modules/@aws-sdk/",
  "/node_modules/@smithy/",
  "/node_modules/bullmq/",
];

export function shouldResolveTslibAsEsm(source: string, importer?: string): boolean {
  if (source !== "tslib" || !importer) {
    return false;
  }

  const normalizedImporter = importer.replaceAll("\\", "/");
  return TSLIB_ESM_IMPORTER_SEGMENTS.some((segment) => normalizedImporter.includes(segment));
}
