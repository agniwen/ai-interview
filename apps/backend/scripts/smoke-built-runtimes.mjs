/* oxlint-disable anti-slop/no-runtime-typeof -- node:net returns its documented string-or-AddressInfo union at this process boundary. */
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  buildMeetingAnswerJobId,
  closeMeetingAnswerQueue,
  getMeetingAnswerQueue,
  reconcileMeetingAnswerJob,
} from "@arc/meeting-processing-queue/meeting-answer";

const backendDirectory = fileURLToPath(new URL("..", import.meta.url));
const entrypoint = fileURLToPath(new URL("../dist/main.js", import.meta.url));
const externalDependencies = process.env.BACKEND_RUNTIME_SMOKE_EXTERNAL === "1";

function commandVersion(command, arguments_) {
  const result = spawnSync(command, arguments_, { encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(`Unable to execute ${command}: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function resolveRuntimes() {
  const bunCommand = process.env.BUN_BINARY?.trim() || "bun";
  const bunVersion = commandVersion(bunCommand, ["--version"]);
  if (!bunVersion.startsWith("1.4.")) {
    throw new Error(`Expected Bun 1.4.x, received ${bunVersion}.`);
  }

  const explicitNode = process.env.NODE24_BINARY?.trim();
  if (explicitNode) {
    const nodeVersion = commandVersion(explicitNode, ["--version"]);
    if (!nodeVersion.startsWith("v24.")) {
      throw new Error(`NODE24_BINARY must resolve to Node 24, received ${nodeVersion}.`);
    }
    return [
      { arguments: [entrypoint], command: bunCommand, name: `Bun ${bunVersion}` },
      { arguments: [entrypoint], command: explicitNode, name: `Node ${nodeVersion}` },
    ];
  }

  const installedNodeVersion = commandVersion("node", ["--version"]);
  if (installedNodeVersion.startsWith("v24.")) {
    return [
      { arguments: [entrypoint], command: bunCommand, name: `Bun ${bunVersion}` },
      { arguments: [entrypoint], command: "node", name: `Node ${installedNodeVersion}` },
    ];
  }

  const node24Version = commandVersion("npx", ["--yes", "--package=node@24", "node", "--version"]);
  if (!node24Version.startsWith("v24.")) {
    throw new Error(`The Node 24 fallback resolved to ${node24Version}.`);
  }
  return [
    { arguments: [entrypoint], command: bunCommand, name: `Bun ${bunVersion}` },
    {
      arguments: ["--yes", "--package=node@24", "node", entrypoint],
      command: "npx",
      name: `Node ${node24Version}`,
    },
  ];
}

async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to allocate a smoke-test port.");
  }
  server.close();
  await once(server, "close");
  return address.port;
}

async function waitForHealthy(port, child, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Backend exited with ${child.exitCode}.\n${output()}`);
    }
    try {
      for (const path of ["/api/health", "/healthz"]) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`);
        const body = await response.json();
        if (response.status !== 200 || body.ok !== true) {
          throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
        }
      }
      if (externalDependencies) {
        const readiness = await fetch(`http://127.0.0.1:${port}/readyz`);
        const readinessBody = await readiness.json();
        if (readiness.status !== 200 || readinessBody.ok !== true) {
          throw new Error(`/readyz returned ${readiness.status}: ${JSON.stringify(readinessBody)}`);
        }
        const diagnostics = await fetch(`http://127.0.0.1:${port}/queues/resume-parse/stats`, {
          headers: { Authorization: `Bearer ${process.env.WORKER_DIAGNOSTICS_SECRET}` },
        });
        if (diagnostics.status !== 200) {
          throw new Error(`Queue diagnostics returned ${diagnostics.status}.`);
        }
      }
      return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`Backend did not become healthy within 30 seconds.\n${output()}`);
}

export async function stop(child, output = () => "", timeoutMs = 5000) {
  if (child.exitCode !== null) {
    return;
  }
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const graceful = await Promise.race([
    exited.then(() => true),
    delay(timeoutMs).then(() => false),
  ]);
  if (graceful) {
    return;
  }
  child.kill("SIGKILL");
  await Promise.race([exited, delay(1000)]);
  throw new Error(`Backend ignored SIGTERM for ${timeoutMs}ms and required SIGKILL.\n${output()}`);
}

export async function waitForCompletedJob({
  child,
  jobId,
  output,
  pollMs = 100,
  queue,
  timeoutMs = 20_000,
}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Backend exited before consuming smoke job ${jobId}.\n${output()}`);
    }
    const job = await queue.getJob(jobId);
    if (job) {
      const state = await job.getState();
      if (state === "completed") {
        return job;
      }
      if (state === "failed") {
        throw new Error(
          `Background processor failed smoke job ${jobId}: ${job.failedReason || "unknown failure"}.\n${output()}`,
        );
      }
    }
    await delay(pollMs);
  }
  throw new Error(`Background processor did not complete smoke job ${jobId}.\n${output()}`);
}

async function verifyBackgroundProcessor(runtime, child, output, queuePrefix) {
  const data = {
    exchangeId: `runtime-smoke:${runtime.name.replaceAll(/[^a-zA-Z0-9]+/gu, "-")}:${randomUUID()}`,
  };
  const jobId = buildMeetingAnswerJobId(data);
  const previousQueuePrefix = process.env.MEETING_ANSWER_QUEUE_PREFIX;
  process.env.MEETING_ANSWER_QUEUE_PREFIX = queuePrefix;
  let queue;
  try {
    queue = getMeetingAnswerQueue();
    await reconcileMeetingAnswerJob(queue, data);
    const completedJob = await waitForCompletedJob({ child, jobId, output, queue });
    await completedJob.remove();
  } finally {
    if (queue) {
      await closeMeetingAnswerQueue();
    }
    if (previousQueuePrefix === undefined) {
      delete process.env.MEETING_ANSWER_QUEUE_PREFIX;
    } else {
      process.env.MEETING_ANSWER_QUEUE_PREFIX = previousQueuePrefix;
    }
  }
}

async function smoke(runtime) {
  const port = await availablePort();
  const queuePrefix = `arc:runtime-smoke:${randomUUID()}`;
  let logs = "";
  const child = spawn(runtime.command, runtime.arguments, {
    cwd: backendDirectory,
    env: externalDependencies
      ? {
          ...process.env,
          BACKGROUND_WORKERS_ENABLED: "true",
          BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
          HOST: "127.0.0.1",
          MEETING_ANSWER_QUEUE_PREFIX: queuePrefix,
          NODE_ENV: "test",
          PORT: String(port),
          READINESS_DATABASE_CHECK_ENABLED: "true",
          SENTRY_DSN: "",
        }
      : {
          ...process.env,
          BACKGROUND_WORKERS_ENABLED: "false",
          BETTER_AUTH_SECRET: "backend-runtime-smoke-secret-that-is-at-least-32-characters",
          BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
          DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/backend_runtime_smoke",
          HOST: "127.0.0.1",
          NODE_ENV: "test",
          PORT: String(port),
          READINESS_DATABASE_CHECK_ENABLED: "false",
          RESUME_SEMANTIC_INDEX_ENABLED: "false",
          SENTRY_DSN: "",
        },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const append = (chunk) => {
    logs = `${logs}${chunk}`.slice(-20_000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  try {
    await waitForHealthy(port, child, () => logs);
    if (externalDependencies) {
      await verifyBackgroundProcessor(runtime, child, () => logs, queuePrefix);
    }
    const mode = externalDependencies ? " with background workers" : "";
    process.stdout.write(`✓ ${runtime.name} served the built ESM artifact${mode}\n`);
  } finally {
    await stop(child, () => logs);
  }
}

async function main() {
  await access(entrypoint);
  for (const runtime of resolveRuntimes()) {
    await smoke(runtime);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  await main();
}
