import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  loadStructuredResumeEvalCandidate,
  loadStructuredResumeEvalCorpus,
} from "./structured-resume-eval/dataset";
import {
  computeStructuredResumeEvalMetrics,
  evaluateStructuredResumeThresholds,
} from "./structured-resume-eval/metrics";
import { formatStructuredResumeEvalReport } from "./structured-resume-eval/report";
import {
  STRUCTURED_RESUME_ENGINE_VERSION,
  STRUCTURED_RESUME_MODEL_ID,
  STRUCTURED_RESUME_PROMPT_VERSION,
} from "../server/agents/structured-resume-evaluation";

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
  const candidatePath = resolve(argument("candidate"));
  const outputPath = resolve(argument("output"));
  const loaded = await loadStructuredResumeEvalCorpus(manifestPath);
  if (
    loaded.manifest.engineVersion !== STRUCTURED_RESUME_ENGINE_VERSION ||
    loaded.manifest.promptVersion !== STRUCTURED_RESUME_PROMPT_VERSION ||
    loaded.manifest.modelId !== STRUCTURED_RESUME_MODEL_ID
  ) {
    throw new Error("STRUCTURED_EVAL_MANIFEST_NOT_CONFIGURED_ENGINE");
  }
  const candidateRun = await loadStructuredResumeEvalCandidate(candidatePath, loaded);
  const metrics = computeStructuredResumeEvalMetrics(candidateRun.cases);
  const gate = evaluateStructuredResumeThresholds(metrics, loaded.manifest.thresholds);
  const generatedAt = new Date().toISOString();
  const report = formatStructuredResumeEvalReport({
    candidateVersion: candidateRun.candidate.candidateVersion,
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
        candidate: candidateRun.candidate,
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
