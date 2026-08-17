import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import pRetry from "p-retry";
import { z } from "zod";
import { MeetingProviderQuotaError } from "../../server/routes/meetings/transcription/provider";
import type {
  FinalTranscriptionAudioChunk,
  MeetingTranscriptionProvider,
} from "../../server/routes/meetings/transcription/provider";
import {
  MEETING_TRANSCRIPTION_AUDIO_CHUNK_DURATION_MS,
  assertMeetingTranscriptionFfmpegVersion,
  mergeMeetingTranscriptionChunkResults,
  prepareMeetingTranscriptionAudioChunks,
  readMeetingTranscriptionFfmpegVersion,
} from "../../server/routes/meetings/transcription/audio-pipeline";
import { createDeepgramMeetingTranscriptionProvider } from "../../server/routes/meetings/transcription/providers/deepgram";
import { createOpenAiMeetingTranscriptionProvider } from "../../server/routes/meetings/transcription/providers/openai";
import { createTingwuMeetingTranscriptionProvider } from "../../server/routes/meetings/transcription/providers/tingwu";
import {
  inspectLocalBenchmarkAsset,
  verifyLocalBenchmarkAsset,
  verifyRemoteBenchmarkAsset,
} from "./asset-verification";
import { meetingTranscriptionEvalDatasetSchema } from "./dataset";
import type { MeetingTranscriptionEvalCase } from "./dataset";
import {
  applyMeetingTranscriptionActualCosts,
  meetingTranscriptionCostLedgerSchema,
} from "./costs";
import {
  loadMeetingTranscriptionBenchmarkCheckpoint,
  saveMeetingTranscriptionBenchmarkCheckpoint,
} from "./checkpoint";
import { buildMeetingTranscriptionBenchmarkReport } from "./report";
import {
  MeetingTranscriptionBenchmarkCallError,
  runMeetingTranscriptionBenchmarkCase,
} from "./runner";
import { createTingwuHttpClient } from "./tingwu-http";
import { acquireMeetingTranscriptionBenchmarkRunLock } from "./run-lock";
import { resolveMeetingTranscriptionBenchmarkEndpoint } from "./provider-endpoint";
import { MEETING_TRANSCRIPTION_PIPELINE_VERSION } from "@arc/meeting-processing-queue/meeting-transcription";
import type { MeetingTranscriptionBenchmarkRun } from "./types";
import { readBoundedBenchmarkJson } from "./bounded-json";

const tingwuUrlSchema = z.record(
  z.string(),
  z.partialRecord(
    z.enum(["microphone", "system"]),
    z
      .array(
        z
          .url()
          .max(4096)
          .refine((value) => {
            try {
              return new URL(value).protocol === "https:";
            } catch {
              return false;
            }
          }, "Tingwu source URL must use HTTPS"),
      )
      .max(32),
  ),
);

const nodeFileErrorSchema = z.object({ code: z.string().optional() }).passthrough();
const benchmarkDeletionSchema = z.enum([
  "deleted",
  "delete-failed",
  "not-applicable",
  "unsupported",
]);

interface AmbiguousRecovery {
  actualCostUsd: number;
  deletion: MeetingTranscriptionBenchmarkRun["deletion"];
}

const { values: cliOptions } = parseArgs({
  allowPositionals: false,
  options: {
    "ambiguous-cost-usd": { type: "string" },
    "ambiguous-deletion": { type: "string" },
    costs: { type: "string" },
    dataset: { type: "string" },
    out: { type: "string" },
    "retry-ambiguous": { default: false, type: "boolean" },
    "tingwu-urls": { type: "string" },
  },
  strict: true,
});

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function resolveCorpusAssetPath(datasetPath: string, assetPath: string): Promise<string> {
  const root = await realpath(dirname(datasetPath));
  const path = await realpath(resolve(root, assetPath));
  const relativePath = relative(root, path);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("Benchmark audio symlink escapes the private corpus directory");
  }
  return path;
}

async function verifyAssets(datasetPath: string, benchmarkCase: MeetingTranscriptionEvalCase) {
  for (const asset of benchmarkCase.assets) {
    const path = await resolveCorpusAssetPath(datasetPath, asset.path);
    await verifyLocalBenchmarkAsset({
      expectedSha256: asset.sha256,
      expectedSizeBytes: asset.sizeBytes,
      path,
    });
  }
}

async function assertOutputDoesNotExist(path: string): Promise<void> {
  try {
    await access(path);
  } catch (error) {
    const fileError = nodeFileErrorSchema.safeParse(error);
    if (fileError.success && fileError.data.code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error(`Benchmark output already exists: ${path}`);
}

function requiredAmbiguousRecovery(): AmbiguousRecovery {
  const costValue = cliOptions["ambiguous-cost-usd"];
  const cost = costValue === undefined ? Number.NaN : Number(costValue);
  const deletion = cliOptions["ambiguous-deletion"];
  const deletionResult = benchmarkDeletionSchema.safeParse(deletion);
  if (!(Number.isFinite(cost) && cost >= 0) || !deletionResult.success) {
    throw new Error(
      "--retry-ambiguous requires --ambiguous-cost-usd and --ambiguous-deletion after provider-console reconciliation",
    );
  }
  return {
    actualCostUsd: cost,
    deletion: deletionResult.data,
  };
}

function mergeDeletionEvidence(
  current: MeetingTranscriptionBenchmarkRun["deletion"],
  prior: MeetingTranscriptionBenchmarkRun["deletion"][],
): MeetingTranscriptionBenchmarkRun["deletion"] {
  const all = new Set([...prior, current]);
  if (all.has("delete-failed")) {
    return "delete-failed";
  }
  if (all.has("unsupported")) {
    return "unsupported";
  }
  if (all.has("deleted")) {
    return "deleted";
  }
  return "not-applicable";
}

async function transcribeBenchmarkChunk(input: {
  benchmarkCase: MeetingTranscriptionEvalCase;
  chunk: FinalTranscriptionAudioChunk;
  model: string;
  provider: MeetingTranscriptionProvider;
  region: string;
  signal: AbortSignal;
  taskIds?: string[];
}) {
  let retryCount = 0;
  let taskCountBeforeAttempt = input.taskIds?.length ?? 0;
  const transcript = await pRetry(
    () => {
      taskCountBeforeAttempt = input.taskIds?.length ?? 0;
      return input.provider.transcribeFinal({
        chunks: [input.chunk],
        languageHint: input.benchmarkCase.reference.language,
        model: input.model,
        region: input.region,
        signal: input.signal,
      });
    },
    {
      factor: 2,
      minTimeout: 1000,
      onFailedAttempt: ({ error, retriesLeft }) => {
        if (
          retriesLeft > 0 &&
          error instanceof MeetingProviderQuotaError &&
          (input.taskIds?.length ?? 0) === taskCountBeforeAttempt
        ) {
          retryCount += 1;
        }
      },
      retries: 2,
      shouldRetry: ({ error }) =>
        error instanceof MeetingProviderQuotaError &&
        (input.taskIds?.length ?? 0) === taskCountBeforeAttempt,
      signal: input.signal,
    },
  );
  return { retryCount, transcript };
}

function providerAdapter(input: {
  benchmarkCase: MeetingTranscriptionEvalCase;
  chunks: FinalTranscriptionAudioChunk[];
  model: string;
  provider: MeetingTranscriptionProvider;
  region: string;
  taskIds?: string[];
}) {
  return {
    async transcribe({ signal }: { signal: AbortSignal }) {
      let retryCount = 0;
      try {
        const results = [];
        for (const chunk of input.chunks) {
          const result = await transcribeBenchmarkChunk({
            benchmarkCase: input.benchmarkCase,
            chunk,
            model: input.model,
            provider: input.provider,
            region: input.region,
            signal,
            taskIds: input.taskIds,
          });
          retryCount += result.retryCount;
          results.push({ chunk, transcript: result.transcript });
        }
        return {
          artifact: input.taskIds && input.taskIds.length > 0 ? [...input.taskIds] : undefined,
          retryCount,
          transcript: mergeMeetingTranscriptionChunkResults(results),
        };
      } catch (error) {
        throw new MeetingTranscriptionBenchmarkCallError(
          error,
          input.taskIds && input.taskIds.length > 0 ? [...input.taskIds] : undefined,
          retryCount,
        );
      }
    },
  };
}

// oxlint-disable-next-line complexity -- one private CLI coordinates three explicit provider adapters and durable evidence.
async function runBenchmark(outputPath: string) {
  if (!cliOptions.dataset) {
    throw new Error(
      "Usage: --dataset <private manifest> [--tingwu-urls <private urls>] [--costs <ledger>] [--out <report>]",
    );
  }
  const datasetPath = resolve(cliOptions.dataset);
  const dataset = meetingTranscriptionEvalDatasetSchema.parse(
    await readBoundedBenchmarkJson(datasetPath),
  );
  await assertOutputDoesNotExist(outputPath);
  await assertOutputDoesNotExist(`${outputPath}.private-evidence`);
  for (const benchmarkCase of dataset.cases) {
    await verifyAssets(datasetPath, benchmarkCase);
  }
  const ffmpegVersion = await readMeetingTranscriptionFfmpegVersion(process.env.FFMPEG_BIN);
  assertMeetingTranscriptionFfmpegVersion(
    ffmpegVersion,
    process.env.MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX,
  );
  const corpusFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        dataset,
        ffmpegVersion,
        pipelineVersion: MEETING_TRANSCRIPTION_PIPELINE_VERSION,
      }),
    )
    .digest("hex");
  const expectedCaseIds = dataset.cases.map((item) => item.id);
  const checkpointPath = `${outputPath}.partial`;
  const tingwuUrlPath = cliOptions["tingwu-urls"];
  const tingwuUrls = tingwuUrlPath
    ? tingwuUrlSchema.parse(await readBoundedBenchmarkJson(resolve(tingwuUrlPath)))
    : null;
  if (!tingwuUrls) {
    throw new Error("--tingwu-urls is required; keep signed source URLs outside the repository");
  }
  for (const benchmarkCase of dataset.cases) {
    for (const asset of benchmarkCase.assets) {
      const urls = tingwuUrls[benchmarkCase.id]?.[asset.track];
      const expectedChunks = Math.ceil(
        asset.durationMs / MEETING_TRANSCRIPTION_AUDIO_CHUNK_DURATION_MS,
      );
      if (!urls || urls.length !== expectedChunks) {
        throw new Error(`Missing Tingwu source URL for ${benchmarkCase.id}/${asset.track}`);
      }
    }
  }
  const credentials = {
    alibabaAccessKeyId: requiredEnvironment("ALIBABA_CLOUD_ACCESS_KEY_ID"),
    alibabaAccessKeySecret: requiredEnvironment("ALIBABA_CLOUD_ACCESS_KEY_SECRET"),
    deepgramApiKey: requiredEnvironment("DEEPGRAM_API_KEY"),
    openAiApiKey: requiredEnvironment("OPENAI_API_KEY"),
    tingwuAppKey: requiredEnvironment("TINGWU_APP_KEY"),
  };
  const costPath = cliOptions.costs;
  const costs = costPath
    ? meetingTranscriptionCostLedgerSchema.parse(await readBoundedBenchmarkJson(resolve(costPath)))
    : {};
  const openAiEndpoint = resolveMeetingTranscriptionBenchmarkEndpoint({
    baseUrl: process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
    provider: "openai",
  });
  const deepgramEndpoint = resolveMeetingTranscriptionBenchmarkEndpoint({
    baseUrl: process.env.DEEPGRAM_BASE_URL?.trim() || "https://api.deepgram.com",
    provider: "deepgram",
  });
  const providerConfigs = [
    {
      baseUrl: "https://tingwu.cn-beijing.aliyuncs.com",
      id: "tingwu" as const,
      model: "tingwu-offline",
      region: "cn-beijing",
    },
    {
      baseUrl: openAiEndpoint.baseUrl,
      id: "openai" as const,
      model: process.env.MEETING_TRANSCRIPTION_OPENAI_MODEL || "gpt-4o-transcribe-diarize",
      region: openAiEndpoint.region,
    },
    {
      baseUrl: deepgramEndpoint.baseUrl,
      id: "deepgram" as const,
      model: process.env.MEETING_TRANSCRIPTION_DEEPGRAM_MODEL || "nova-3",
      region: deepgramEndpoint.region,
    },
  ];
  const checkpoint = await loadMeetingTranscriptionBenchmarkCheckpoint(checkpointPath, {
    corpusFingerprint,
    expectedCaseIds,
  });
  if (checkpoint.inFlight && !cliOptions["retry-ambiguous"]) {
    throw new Error(
      `The prior ${checkpoint.inFlight.provider}/${checkpoint.inFlight.caseId} call has an ambiguous billing outcome. Verify the provider console, then pass --retry-ambiguous only if a new paid call is intended.`,
    );
  }
  if (checkpoint.inFlight) {
    const recovery = requiredAmbiguousRecovery();
    checkpoint.attemptHistory.push({ ...checkpoint.inFlight, ...recovery });
    checkpoint.inFlight = null;
    await saveMeetingTranscriptionBenchmarkCheckpoint(checkpointPath, checkpoint);
  }
  const { attemptHistory } = checkpoint;
  const { runs } = checkpoint;
  const completed = new Set(runs.map((run) => `${run.provider}:${run.caseId}`));
  for (const benchmarkCase of dataset.cases) {
    const configsToRun = providerConfigs.filter(
      (config) => !completed.has(`${config.id}:${benchmarkCase.id}`),
    );
    if (configsToRun.length === 0) {
      continue;
    }
    const workingDirectory = await mkdtemp(join(tmpdir(), "meeting-transcription-eval-"));
    try {
      const chunks = await prepareMeetingTranscriptionAudioChunks({
        directory: workingDirectory,
        ffmpegBin: process.env.FFMPEG_BIN,
        ffmpegTimeoutMs: 30 * 60 * 1000,
        sources: await Promise.all(
          benchmarkCase.assets.map(async (asset) => ({
            durationMs: asset.durationMs,
            filePath: await resolveCorpusAssetPath(datasetPath, asset.path),
            track: asset.track,
          })),
        ),
      });
      for (const chunk of chunks) {
        const identity = await inspectLocalBenchmarkAsset(chunk.filePath);
        const url = tingwuUrls[benchmarkCase.id]?.[chunk.track]?.[chunk.index];
        if (!url) {
          throw new Error(
            `Missing Tingwu source URL for ${benchmarkCase.id}/${chunk.track}/${chunk.index}`,
          );
        }
        await verifyRemoteBenchmarkAsset({
          expectedSha256: identity.sha256,
          expectedSizeBytes: identity.bytes,
          signal: AbortSignal.timeout(30 * 60 * 1000),
          url,
        });
      }
      for (const config of configsToRun) {
        const runKey = `${config.id}:${benchmarkCase.id}`;
        const taskIds: string[] = [];
        let provider: MeetingTranscriptionProvider;
        if (config.id === "openai") {
          provider = createOpenAiMeetingTranscriptionProvider({
            apiKey: credentials.openAiApiKey,
            baseUrl: config.baseUrl,
          });
        } else if (config.id === "deepgram") {
          provider = createDeepgramMeetingTranscriptionProvider({
            apiKey: credentials.deepgramApiKey,
            baseUrl: config.baseUrl,
          });
        } else {
          const client = createTingwuHttpClient({
            accessKeyId: credentials.alibabaAccessKeyId,
            accessKeySecret: credentials.alibabaAccessKeySecret,
            appKey: credentials.tingwuAppKey,
            baseUrl: config.baseUrl,
            onTaskCreated: async (taskId) => {
              taskIds.push(taskId);
              await saveMeetingTranscriptionBenchmarkCheckpoint(checkpointPath, {
                attemptHistory,
                corpusFingerprint,
                expectedCaseIds,
                inFlight: {
                  caseId: benchmarkCase.id,
                  provider: config.id,
                  remoteTaskIds: [...taskIds],
                },
                runs,
              });
            },
          });
          provider = createTingwuMeetingTranscriptionProvider({
            createAudioUrl: (chunk) => {
              const url = tingwuUrls[benchmarkCase.id]?.[chunk.track]?.[chunk.index];
              if (!url) {
                return Promise.reject(
                  new Error(
                    `Missing Tingwu source URL for ${benchmarkCase.id}/${chunk.track}/${chunk.index}`,
                  ),
                );
              }
              return Promise.resolve(url);
            },
            taskKeyPrefix: createHash("sha256")
              .update(`${corpusFingerprint}:${benchmarkCase.id}`)
              .digest("hex")
              .slice(0, 32),
            ...client,
          });
        }
        await saveMeetingTranscriptionBenchmarkCheckpoint(checkpointPath, {
          attemptHistory,
          corpusFingerprint,
          expectedCaseIds,
          inFlight: { caseId: benchmarkCase.id, provider: config.id, remoteTaskIds: [] },
          runs,
        });
        const run = await runMeetingTranscriptionBenchmarkCase({
          actualCostUsd: costs[config.id]?.[benchmarkCase.id] ?? null,
          adapter: providerAdapter({
            benchmarkCase,
            chunks,
            model: config.model,
            provider,
            region: config.region,
            taskIds,
          }),
          benchmarkCase,
          maxAttempts: 1,
          model: config.model,
          provider: config.id,
          region: config.region,
        });
        const priorAttempts = attemptHistory.filter(
          (attempt) => attempt.provider === config.id && attempt.caseId === benchmarkCase.id,
        );
        runs.push({
          ...run,
          deletion: mergeDeletionEvidence(
            run.deletion,
            priorAttempts.map((attempt) => attempt.deletion),
          ),
          reconciledAttemptCostUsd: priorAttempts.reduce(
            (total, attempt) => total + attempt.actualCostUsd,
            0,
          ),
          retryCount: run.retryCount + priorAttempts.length,
        });
        completed.add(runKey);
        await saveMeetingTranscriptionBenchmarkCheckpoint(checkpointPath, {
          attemptHistory,
          corpusFingerprint,
          expectedCaseIds,
          inFlight: null,
          runs,
        });
      }
    } finally {
      await rm(workingDirectory, { force: true, recursive: true });
    }
  }
  const costedRuns = applyMeetingTranscriptionActualCosts(runs, costs);
  const report = buildMeetingTranscriptionBenchmarkReport({
    corpusId: dataset.corpusId,
    expectedCaseIds,
    generatedAt: new Date().toISOString(),
    runs: costedRuns,
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        corpusFingerprint,
        expectedCaseIds,
        ffmpegVersion,
        pipelineVersion: MEETING_TRANSCRIPTION_PIPELINE_VERSION,
        report,
        runs: costedRuns,
      },
      null,
      2,
    )}\n`,
    { flag: "wx" },
  );
  await writeFile(`${outputPath}.private-evidence`, await readFile(checkpointPath), {
    flag: "wx",
    mode: 0o600,
  });
  await unlink(checkpointPath);
  console.info(JSON.stringify({ outputPath, ...report.decision }));
}

async function main() {
  const outputPath = resolve(cliOptions.out ?? ".eval/meeting-transcription/report.json");
  const release = await acquireMeetingTranscriptionBenchmarkRunLock(outputPath);
  try {
    await runBenchmark(outputPath);
  } finally {
    await release();
  }
}

await main();
