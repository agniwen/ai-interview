import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { MEETING_TRANSCRIPTION_PIPELINE_VERSION } from "@app/meeting-processing-queue/meeting-transcription";
import {
  applyMeetingTranscriptionActualCosts,
  meetingTranscriptionCostLedgerSchema,
} from "./costs";
import { buildMeetingTranscriptionBenchmarkReport } from "./report";
import { meetingTranscriptionBenchmarkRunSchema } from "./types";

const runArtifactSchema = z.object({
  corpusFingerprint: z.string().regex(/^[a-f\d]{64}$/),
  expectedCaseIds: z.array(z.string().min(1)).min(20).max(50),
  ffmpegVersion: z.string().startsWith("ffmpeg version "),
  pipelineVersion: z.literal(MEETING_TRANSCRIPTION_PIPELINE_VERSION),
  report: z.object({ corpusId: z.string().min(1) }).passthrough(),
  runs: z.array(meetingTranscriptionBenchmarkRunSchema),
});

async function main() {
  const { values } = parseArgs({
    allowPositionals: false,
    options: {
      costs: { type: "string" },
      out: { type: "string" },
      run: { type: "string" },
    },
    strict: true,
  });
  const runPath = values.run;
  const costPath = values.costs;
  const outputPath = values.out;
  if (!(runPath && costPath && outputPath)) {
    throw new Error("Usage: --run <original run> --costs <actual cost ledger> --out <new report>");
  }
  const artifact = runArtifactSchema.parse(JSON.parse(await readFile(resolve(runPath), "utf-8")));
  const ledger = meetingTranscriptionCostLedgerSchema.parse(
    JSON.parse(await readFile(resolve(costPath), "utf-8")),
  );
  const runs = applyMeetingTranscriptionActualCosts(artifact.runs, ledger);
  const report = buildMeetingTranscriptionBenchmarkReport({
    corpusId: artifact.report.corpusId,
    expectedCaseIds: artifact.expectedCaseIds,
    generatedAt: new Date().toISOString(),
    runs,
  });
  const destination = resolve(outputPath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify({ ...artifact, report, runs }, null, 2)}\n`, {
    flag: "wx",
  });
  console.info(JSON.stringify({ outputPath: destination, ...report.decision }));
}

await main();
