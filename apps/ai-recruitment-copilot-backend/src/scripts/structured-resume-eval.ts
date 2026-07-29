import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadStructuredResumeEvalCorpus } from "./structured-resume-eval/dataset";
import {
  computeStructuredResumeEvalMetrics,
  evaluateStructuredResumeThresholds,
} from "./structured-resume-eval/metrics";
import { formatStructuredResumeEvalReport } from "./structured-resume-eval/report";

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`missing --${name}`);
  }
  return value;
}

async function main() {
  const corpus = resolve(argument("corpus"));
  const manifestPath = corpus.endsWith(".json") ? corpus : resolve(corpus, "manifest.json");
  const outputPath = resolve(argument("output"));
  const loaded = await loadStructuredResumeEvalCorpus(manifestPath);
  const metrics = computeStructuredResumeEvalMetrics(loaded.cases);
  const gate = evaluateStructuredResumeThresholds(metrics, loaded.manifest.thresholds);
  const generatedAt = new Date().toISOString();
  const report = formatStructuredResumeEvalReport({
    corpusHash: loaded.corpusHash,
    gate,
    generatedAt,
    manifest: loaded.manifest,
    metrics,
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${report}\n`, "utf-8");
  await writeFile(
    `${outputPath}.json`,
    `${JSON.stringify(
      {
        corpusHash: loaded.corpusHash,
        gate,
        generatedAt,
        manifest: loaded.manifest,
        metrics,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
  console.log(report);
  if (!gate.passed) {
    throw new Error("STRUCTURED_EVAL_THRESHOLDS_FAILED");
  }
  if (loaded.manifest.approval.status !== "approved") {
    throw new Error("STRUCTURED_EVAL_HUMAN_APPROVAL_REQUIRED");
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
