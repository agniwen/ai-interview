import "dotenv/config";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { matchJobDescriptionForResume } from "@arc/ai-recruitment-copilot-backend/server/agents/job-description-match-agent";
import { SYNTHETIC_JD_MATCH_CASES } from "./jd-match-synthetic-eval/cases";
import {
  computeJdMatchSyntheticMetrics,
  getJdMatchStrictFailures,
} from "./jd-match-synthetic-eval/metrics";
import { formatJdMatchSyntheticReport } from "./jd-match-synthetic-eval/report";
import type { SyntheticJdMatchRunRecord } from "./jd-match-synthetic-eval/types";

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
    ? SYNTHETIC_JD_MATCH_CASES.filter((testCase) => testCase.id === caseId)
    : SYNTHETIC_JD_MATCH_CASES;
  if (!cases.length) {
    throw new Error(`unknown --case ${caseId}`);
  }
  return cases;
}

async function main() {
  const cases = selectedCases();
  if (!hasFlag("execute")) {
    console.log("JD 匹配合成评测默认不调用模型。待运行案例：");
    for (const testCase of cases) {
      console.log(`- ${testCase.id}: ${testCase.name}`);
    }
    console.log("显式添加 --execute 才会调用模型，例如：--execute --runs 3 --strict");
    return;
  }

  const runsPerCase = Math.min(10, Math.max(1, Number.parseInt(arg("runs", "3"), 10) || 3));
  if (hasFlag("strict") && runsPerCase < 3) {
    throw new Error("strict 模式每个案例至少需要运行 3 次");
  }
  const outputDirectory = arg("output", ".eval");
  const startedAt = new Date().toISOString();
  const records: SyntheticJdMatchRunRecord[] = [];

  for (const testCase of cases) {
    for (let runIndex = 1; runIndex <= runsPerCase; runIndex += 1) {
      try {
        const result = await matchJobDescriptionForResume(
          testCase.resumeProfile,
          testCase.candidates,
        );
        if (!result) {
          throw new Error("JD 匹配 Agent 未返回候选岗位");
        }
        records.push({ caseId: testCase.id, result, runIndex, status: "success" });
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

  const metrics = computeJdMatchSyntheticMetrics(cases, records);
  const endedAt = new Date().toISOString();
  const report = formatJdMatchSyntheticReport({
    endedAt,
    gitSha: execSync("git rev-parse --short HEAD").toString().trim(),
    metrics,
    runsPerCase,
    startedAt,
  });
  mkdirSync(outputDirectory, { recursive: true });
  const stamp = startedAt.replaceAll(/[:.]/g, "-");
  writeFileSync(
    `${outputDirectory}/jd-match-synthetic-runs-${stamp}.jsonl`,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
  writeFileSync(
    `${outputDirectory}/jd-match-synthetic-metrics-${stamp}.json`,
    `${JSON.stringify(metrics, null, 2)}\n`,
  );
  writeFileSync(`${outputDirectory}/jd-match-synthetic-report-${stamp}.md`, `${report}\n`);
  console.log(report);

  if (hasFlag("strict")) {
    const failures = getJdMatchStrictFailures(metrics, runsPerCase);
    if (failures.length) {
      throw new Error(`JD 匹配合成评测未通过：${failures.join("；")}`);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
