import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { structuredSchema } from "@app/db-schema/resume-parser-schema";
import { runAliyunResumeExtraction } from "@server/lib/server/aliyun-docmining";
import { loadStandaloneEnv } from "../standalone/env";

interface TimedResult<T> {
  durationMs: number;
  result: T;
}

function arg(name: string, fallback?: string): string {
  const equals = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (equals) {
    return equals.slice(name.length + 3);
  }
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value && !value.startsWith("--")) {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing --${name}.`);
}

function loadScriptEnv() {
  loadStandaloneEnv();
}

async function timed<T>(operation: () => Promise<T>): Promise<TimedResult<T>> {
  const startedAt = performance.now();
  const result = await operation();
  return {
    durationMs: Math.round(performance.now() - startedAt),
    result,
  };
}

function formatMilliseconds(value: number) {
  return `${(value / 1000).toFixed(2)}s`;
}

function fastestPath(currentMs: number, aliyunMs: number) {
  if (currentMs === aliyunMs) {
    return "tie";
  }
  return currentMs < aliyunMs ? "current" : "aliyun";
}

async function main() {
  loadScriptEnv();
  const [
    { extractResumeDocumentText, generateResumeStructured, RESUME_STRUCTURED_INSTRUCTIONS },
    { parseJsonOutput },
  ] = await Promise.all([
    import("@server/lib/server/resume-parse-pipeline"),
    import("@app/ai-runtime/json-output"),
  ]);
  const filePath = path.resolve(arg("file"));
  const outputDirectory = path.resolve(arg("output", ".eval/resume-parse-benchmark"));
  const aliyunPromptFile = arg("aliyun-prompt-file", "");
  const parseTimeoutMs = Number.parseInt(arg("aliyun-parse-timeout-ms", "120000"), 10);
  if (!Number.isFinite(parseTimeoutMs) || parseTimeoutMs <= 0) {
    throw new Error("--aliyun-parse-timeout-ms must be a positive integer.");
  }
  const apiKey = process.env.ALIBABA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ALIBABA_API_KEY is not configured.");
  }

  const bytes = new Uint8Array(await readFile(filePath));
  const aliyunPrompt = aliyunPromptFile
    ? await readFile(path.resolve(aliyunPromptFile), "utf-8")
    : RESUME_STRUCTURED_INSTRUCTIONS;
  const fileName = path.basename(filePath);
  const startedAt = new Date().toISOString();

  console.log(`Benchmarking ${fileName} (${bytes.byteLength} bytes)`);
  console.log("Current path: direct OCR + structured extraction (database/cache bypassed)");

  const currentTotalStartedAt = performance.now();
  const currentOcr = await timed(() =>
    extractResumeDocumentText({
      bytes,
      fileName,
      mediaType: "application/pdf",
    }),
  );
  const currentStructured = await timed(() =>
    generateResumeStructured(currentOcr.result.text, { fileName }),
  );
  const currentTotalMs = Math.round(performance.now() - currentTotalStartedAt);

  console.log(
    `Current path complete: OCR ${formatMilliseconds(currentOcr.durationMs)}, structure ${formatMilliseconds(currentStructured.durationMs)}, total ${formatMilliseconds(currentTotalMs)}`,
  );
  console.log("Aliyun path: upload + document parse + RESUME_EXTRACTION");

  const aliyunTotalStartedAt = performance.now();
  const aliyun = await runAliyunResumeExtraction({
    apiKey,
    bytes,
    fileName,
    parseTimeoutMs,
    prompt: aliyunPrompt,
  });
  let aliyunStructured: unknown = aliyun.content;
  let aliyunValidationError: string | null = null;
  try {
    aliyunStructured = parseJsonOutput(
      aliyun.content,
      structuredSchema,
      "aliyun-resume-extraction",
    );
  } catch (error) {
    aliyunValidationError = error instanceof Error ? error.message : String(error);
  }
  const aliyunTotalMs = Math.round(performance.now() - aliyunTotalStartedAt);
  const aliyunValidationMs = Math.max(aliyunTotalMs - aliyun.timingsMs.total, 0);

  console.log(
    `Aliyun path complete: lease ${formatMilliseconds(aliyun.timingsMs.applyLease)}, upload ${formatMilliseconds(aliyun.timingsMs.ossUpload)}, parse ${formatMilliseconds(aliyun.timingsMs.submitParse)}, extraction ${formatMilliseconds(aliyun.timingsMs.extraction)}, validation ${formatMilliseconds(aliyunValidationMs)}, total ${formatMilliseconds(aliyunTotalMs)}`,
  );

  const fastest = fastestPath(currentTotalMs, aliyunTotalMs);
  const slowerMs = Math.max(currentTotalMs, aliyunTotalMs);
  const fasterMs = Math.min(currentTotalMs, aliyunTotalMs);
  const report = {
    aliyun: {
      cleanup: aliyun.cleanup,
      extractionAttempts: aliyun.extractionAttempts,
      output: aliyunStructured,
      pageCount: aliyun.pageCount,
      rawOutput: aliyun.content,
      timingsMs: {
        ...aliyun.timingsMs,
        total: aliyunTotalMs,
        validation: aliyunValidationMs,
      },
      usage: aliyun.usage,
      validationError: aliyunValidationError,
    },
    comparison: {
      deltaMs: Math.abs(currentTotalMs - aliyunTotalMs),
      fastest,
      speedupRatio: Number((slowerMs / fasterMs).toFixed(2)),
    },
    current: {
      output: currentStructured.result,
      pageCount: currentOcr.result.pageCount,
      textChars: currentOcr.result.text.length,
      textSource: currentOcr.result.textSource,
      timingsMs: {
        ocr: currentOcr.durationMs,
        structured: currentStructured.durationMs,
        total: currentTotalMs,
      },
    },
    file: {
      name: fileName,
      sizeBytes: bytes.byteLength,
    },
    startedAt,
  };

  await mkdir(outputDirectory, { recursive: true });
  const stamp = startedAt.replaceAll(/[:.]/g, "-");
  const outputPath = path.join(outputDirectory, `result-${stamp}.json`);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    fastest === "tie"
      ? "Result: both paths took the same time."
      : `Result: ${fastest} was ${report.comparison.speedupRatio}x faster (${formatMilliseconds(report.comparison.deltaMs)} difference).`,
  );
  console.log(`Full structured outputs: ${outputPath}`);
  console.log(
    aliyun.cleanup.deleted
      ? "Aliyun temporary file deleted."
      : `Warning: Aliyun temporary file cleanup failed: ${aliyun.cleanup.error}`,
  );
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
