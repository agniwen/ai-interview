import "../standalone/preload";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { generateResumeReview } from "../server/agents/resume-analysis-agent";
import { SYNTHETIC_RESUME_REVIEW_CASES } from "./resume-review-synthetic-eval/cases";
import {
  computeSyntheticEvalMetrics,
  getSyntheticEvalStrictFailures,
} from "./resume-review-synthetic-eval/metrics";
import { formatSyntheticEvalReport } from "./resume-review-synthetic-eval/report";
import type { SyntheticRunRecord } from "./resume-review-synthetic-eval/types";

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

function selectedCases() {
  const caseId = arg("case", "").trim();
  const cases = caseId
    ? SYNTHETIC_RESUME_REVIEW_CASES.filter((testCase) => testCase.id === caseId)
    : SYNTHETIC_RESUME_REVIEW_CASES;
  if (!cases.length) {
    throw new Error(`unknown --case ${caseId}`);
  }
  return cases;
}

async function main() {
  const cases = selectedCases();
  if (!hasFlag("execute")) {
    console.log("合成评分评测默认不调用模型。待运行案例：");
    for (const testCase of cases) {
      console.log(`- ${testCase.id}: ${testCase.name}`);
    }
    console.log("显式添加 --execute 才会调用模型，例如：--execute --runs 3");
    return;
  }

  const runsPerCase = Math.min(10, Math.max(1, Number.parseInt(arg("runs", "3"), 10) || 3));
  const outputDirectory = arg("output", ".eval");
  const startedAt = new Date().toISOString();
  const records: SyntheticRunRecord[] = [];
  for (const testCase of cases) {
    for (let runIndex = 1; runIndex <= runsPerCase; runIndex += 1) {
      try {
        const result = await generateResumeReview({
          jobDescription: testCase.jobDescription,
          resumeProfile: testCase.resumeProfile,
          screeningResult: testCase.screeningResult,
        });
        records.push({
          caseId: testCase.id,
          review: result.structuredReview,
          runIndex,
          status: "success",
        });
      } catch (error) {
        records.push({
          caseId: testCase.id,
          error: error instanceof Error ? error.message : String(error),
          runIndex,
          status: "failed",
        });
      }
    }
  }

  const metrics = computeSyntheticEvalMetrics(cases, records);
  const endedAt = new Date().toISOString();
  const report = formatSyntheticEvalReport({
    endedAt,
    gitSha: execSync("git rev-parse --short HEAD").toString().trim(),
    metrics,
    runsPerCase,
    startedAt,
  });
  mkdirSync(outputDirectory, { recursive: true });
  const stamp = startedAt.replaceAll(/[:.]/g, "-");
  writeFileSync(
    `${outputDirectory}/resume-review-synthetic-runs-${stamp}.jsonl`,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
  writeFileSync(
    `${outputDirectory}/resume-review-synthetic-metrics-${stamp}.json`,
    `${JSON.stringify(metrics, null, 2)}\n`,
  );
  writeFileSync(`${outputDirectory}/resume-review-synthetic-report-${stamp}.md`, `${report}\n`);
  console.log(report);

  if (hasFlag("strict")) {
    const failures = getSyntheticEvalStrictFailures(metrics, runsPerCase);
    if (failures.length) {
      throw new Error(`合成评测未通过：${failures.join("；")}`);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
