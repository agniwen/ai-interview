import "../standalone/preload";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  buildResumeReviewEvalDataset,
  loadResumeReviewEvalRows,
} from "./resume-review-eval/dataset";
import { computeResumeReviewEvalMetrics } from "./resume-review-eval/metrics";
import { formatResumeReviewEvalReport } from "./resume-review-eval/report";

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
  throw new Error(`missing --${name}`);
}

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const organizationId = arg("org", "org_default");
  const outputDirectory = arg("output", ".eval");
  const strict = hasFlag("strict");
  const startedAt = new Date().toISOString();
  const rows = await loadResumeReviewEvalRows(organizationId);
  const dataset = buildResumeReviewEvalDataset(rows);
  const metrics = computeResumeReviewEvalMetrics(dataset.samples);
  const jsonl = dataset.samples.map((sample) => JSON.stringify(sample)).join("\n");
  const datasetHash = createHash("sha256").update(jsonl).digest("hex").slice(0, 12);
  const endedAt = new Date().toISOString();
  const report = formatResumeReviewEvalReport({
    datasetHash,
    diagnostics: dataset.diagnostics,
    endedAt,
    gitSha: execSync("git rev-parse --short HEAD").toString().trim(),
    metrics,
    organizationId,
    startedAt,
  });

  mkdirSync(outputDirectory, { recursive: true });
  const stamp = startedAt.replaceAll(/[:.]/g, "-");
  writeFileSync(`${outputDirectory}/resume-review-dataset-${stamp}.jsonl`, `${jsonl}\n`);
  writeFileSync(
    `${outputDirectory}/resume-review-metrics-${stamp}.json`,
    `${JSON.stringify(metrics, null, 2)}\n`,
  );
  writeFileSync(`${outputDirectory}/resume-review-report-${stamp}.md`, `${report}\n`);
  console.log(report);

  if (!dataset.samples.length) {
    throw new Error("evaluableRows=0（没有可用于评分评测的成熟标签）");
  }
  const coverage = dataset.diagnostics.labelEligibleRows
    ? dataset.samples.length / dataset.diagnostics.labelEligibleRows
    : 0;
  if (strict && coverage < 0.8) {
    throw new Error(`可评测覆盖率 ${(coverage * 100).toFixed(1)}% < 80% (--strict)`);
  }
  if (strict && metrics.guardrails.hiredRejectCount > 0) {
    throw new Error(
      `已录用候选人被误 reject ${metrics.guardrails.hiredRejectCount}/${metrics.guardrails.hiredCount} (--strict)`,
    );
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (process.env.DATABASE_URL) {
    const { closeDatabase } = await import("@app/server/lib/server/db");
    await closeDatabase();
  }
}
