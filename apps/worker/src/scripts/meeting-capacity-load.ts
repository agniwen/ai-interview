import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  buildMeetingTranscriptionJobId,
  closeMeetingTranscriptionQueue,
  enqueueMeetingTranscriptionJobs,
  getMeetingTranscriptionQueue,
  meetingTranscriptionJobSchema,
} from "@arc/meeting-processing-queue/meeting-transcription";
import { z } from "zod";

const MODE = process.env.MEETING_LOAD_MODE?.trim();
const BASE_URL = process.env.MEETING_LOAD_BASE_URL?.replace(/\/$/, "");
const WORKSPACE_SLUG = process.env.MEETING_LOAD_WORKSPACE_SLUG?.trim();
const COOKIE = process.env.MEETING_LOAD_COOKIE?.trim();
const DEFAULT_DURATION_SECONDS = 120;
const FINAL_LOAD_POLL_MS = 100;
const FINAL_LOAD_TIMEOUT_MS = 60 * 60 * 1000;

const liveSessionCookiesSchema = z.array(z.string().min(1)).length(100);
const directUploadPlanSchema = z.object({
  uploads: z.array(
    z.object({
      headers: z.record(z.string(), z.string()),
      track: z.enum(["microphone", "system"]),
      url: z.string(),
    }),
  ),
});
const operationsSnapshotSchema = z.object({
  queues: z
    .object({
      finalTranscription: z
        .object({
          active: z.number().optional(),
          concurrency: z.number().optional(),
          waiting: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
});

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function apiFetchWithCookie(
  path: string,
  init: RequestInit,
  cookie: string | undefined,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (cookie) {
    headers.set("Cookie", cookie);
  }
  const response = await fetch(`${required(BASE_URL, "MEETING_LOAD_BASE_URL")}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    throw new Error(`Load request failed with HTTP ${response.status}`);
  }
  return response;
}

function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return apiFetchWithCookie(path, init, COOKIE);
}

async function loadLiveSessionCookies(): Promise<string[]> {
  const file = required(
    process.env.MEETING_LOAD_LIVE_COOKIES_FILE,
    "MEETING_LOAD_LIVE_COOKIES_FILE",
  );
  const parsed = liveSessionCookiesSchema.safeParse(JSON.parse(await readFile(file, "utf-8")));
  if (!parsed.success) {
    throw new Error("MEETING_LOAD_LIVE_COOKIES_FILE must contain exactly 100 session cookies");
  }
  return parsed.data;
}

async function runLiveLeaseLoad(): Promise<void> {
  const slug = encodeURIComponent(required(WORKSPACE_SLUG, "MEETING_LOAD_WORKSPACE_SLUG"));
  const cookies = await loadLiveSessionCookies();
  const captures = Array.from({ length: 100 }, () => randomUUID());
  await Promise.all(
    captures.map((captureId, index) =>
      apiFetchWithCookie(
        `/api/w/${slug}/meetings/live-transcript`,
        {
          body: JSON.stringify({ captureId, track: "microphone" }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
        cookies[index],
      ),
    ),
  );
  const durationSeconds = Number.parseInt(
    process.env.MEETING_LOAD_DURATION_SECONDS ?? String(DEFAULT_DURATION_SECONDS),
    10,
  );
  const deadline = Date.now() + durationSeconds * 1000;
  while (Date.now() < deadline) {
    await delay(30_000);
    await Promise.all(
      captures.map((captureId, index) =>
        apiFetchWithCookie(
          `/api/w/${slug}/meetings/live-transcript/${captureId}/heartbeat`,
          { method: "POST" },
          cookies[index],
        ),
      ),
    );
  }
  await Promise.all(
    captures.map((captureId, index) =>
      apiFetchWithCookie(
        `/api/w/${slug}/meetings/live-transcript/${captureId}`,
        { method: "DELETE" },
        cookies[index],
      ),
    ),
  );
  console.info("meeting live lease load completed", { captures: captures.length, durationSeconds });
}

async function runDirectUploadLoad(): Promise<void> {
  const slug = encodeURIComponent(required(WORKSPACE_SLUG, "MEETING_LOAD_WORKSPACE_SLUG"));
  const microphone = await readFile(
    required(process.env.MEETING_LOAD_MICROPHONE_FILE, "MEETING_LOAD_MICROPHONE_FILE"),
  );
  const system = await readFile(
    required(process.env.MEETING_LOAD_SYSTEM_FILE, "MEETING_LOAD_SYSTEM_FILE"),
  );
  const contentType = process.env.MEETING_LOAD_CONTENT_TYPE?.trim() || "audio/webm;codecs=opus";
  const durationMs = Number.parseInt(process.env.MEETING_LOAD_AUDIO_DURATION_MS ?? "60000", 10);

  await Promise.all(
    Array.from({ length: 100 }, async () => {
      const meetingId = randomUUID();
      const timestamp = new Date().toISOString();
      const manifestSha256 = createHash("sha256").update(meetingId).digest("hex");
      const response = await apiFetch(`/api/w/${slug}/meetings`, {
        body: JSON.stringify({
          assets: [
            {
              contentType,
              durationMs,
              fragmentCount: 1,
              sha256: sha256(microphone),
              sizeBytes: microphone.byteLength,
              track: "microphone",
            },
            {
              contentType,
              durationMs,
              fragmentCount: 1,
              sha256: sha256(system),
              sizeBytes: system.byteLength,
              track: "system",
            },
          ],
          id: meetingId,
          manifestSha256,
          savedAt: timestamp,
          startedAt: timestamp,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const plan = directUploadPlanSchema.parse(await response.json());
      await Promise.all(
        plan.uploads.map(async (upload) => {
          const result = await fetch(upload.url, {
            body: upload.track === "microphone" ? microphone : system,
            headers: upload.headers,
            method: "PUT",
          });
          if (!result.ok) {
            throw new Error(`Object upload failed with HTTP ${result.status}`);
          }
        }),
      );
      await apiFetch(`/api/w/${slug}/meetings/${meetingId}/complete`, {
        body: JSON.stringify({ manifestSha256 }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
    }),
  );
  console.info("meeting direct upload load completed", { meetings: 100 });
}

async function runFinalTranscriptionLoad(): Promise<void> {
  const jobsFile = required(
    process.env.MEETING_LOAD_FINAL_JOBS_FILE,
    "MEETING_LOAD_FINAL_JOBS_FILE",
  );
  const jobs = meetingTranscriptionJobSchema
    .array()
    .length(20)
    .parse(JSON.parse(await readFile(jobsFile, "utf-8")));
  const jobIds = jobs.map(buildMeetingTranscriptionJobId);
  if (new Set(jobIds).size !== 20 || new Set(jobs.map((job) => job.meetingId)).size !== 20) {
    throw new Error("Final transcription load requires 20 distinct meeting and job identities");
  }
  const queue = getMeetingTranscriptionQueue();
  try {
    const existingStates = await Promise.all(
      jobIds.map(async (jobId) => {
        const job = await queue.getJob(jobId);
        return job?.getState();
      }),
    );
    if (existingStates.some((state) => state && state !== "completed" && state !== "failed")) {
      throw new Error("Final transcription load requires fresh, non-active job identities");
    }
    await enqueueMeetingTranscriptionJobs(jobs);
    let maxActive = 0;
    let terminalStates: string[] = [];
    const deadline = Date.now() + FINAL_LOAD_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const states = await Promise.all(
        jobIds.map(async (jobId) => {
          const job = await queue.getJob(jobId);
          return (await job?.getState()) ?? "missing";
        }),
      );
      maxActive = Math.max(maxActive, states.filter((state) => state === "active").length);
      if (states.every((state) => state === "completed" || state === "failed")) {
        terminalStates = states;
        break;
      }
      await delay(FINAL_LOAD_POLL_MS);
    }
    if (terminalStates.length !== 20) {
      throw new Error(
        "Final transcription load timed out before all 20 jobs reached terminal state",
      );
    }
    if (maxActive !== 20) {
      throw new Error(
        `Final transcription load observed only ${maxActive} simultaneous active jobs`,
      );
    }
    const diagnosticsSecret = required(
      process.env.WORKER_DIAGNOSTICS_SECRET,
      "WORKER_DIAGNOSTICS_SECRET",
    );
    const response = await apiFetch("/operations/meetings", {
      headers: { Authorization: `Bearer ${diagnosticsSecret}` },
    });
    const snapshot = operationsSnapshotSchema.parse(await response.json());
    console.info("meeting final transcription load completed", {
      completed: terminalStates.filter((state) => state === "completed").length,
      failed: terminalStates.filter((state) => state === "failed").length,
      maxActive,
      queue: snapshot.queues?.finalTranscription ?? null,
    });
  } finally {
    await closeMeetingTranscriptionQueue();
  }
}

if (MODE === "live") {
  await runLiveLeaseLoad();
} else if (MODE === "upload") {
  await runDirectUploadLoad();
} else if (MODE === "final") {
  await runFinalTranscriptionLoad();
} else {
  throw new Error("MEETING_LOAD_MODE must be live, upload, or final");
}
