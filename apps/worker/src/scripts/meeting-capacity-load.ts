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

// 选择 live-lease、direct-upload 或 final-transcription 三种独立准入路径。 / Selects one independent admission path: live-lease, direct-upload, or final-transcription.
const MODE = process.env.MEETING_LOAD_MODE?.trim();
// 去除尾部斜杠，保证所有压测请求拼接到同一 API 根地址。 / Strips the trailing slash so every load request joins the same API root consistently.
const BASE_URL = process.env.MEETING_LOAD_BASE_URL?.replace(/\/$/, "");
// live/direct 模式将该 slug 编码进工作区范围 API，避免跨租户请求。 / Encoded into workspace-scoped APIs in live/direct modes to keep requests tenant-bound.
const WORKSPACE_SLUG = process.env.MEETING_LOAD_WORKSPACE_SLUG?.trim();
// direct/final 模式复用此会话；live 模式改用 100 个独立用户 Cookie。 / Reused by direct/final modes, while live mode uses 100 distinct user cookies.
const COOKIE = process.env.MEETING_LOAD_COOKIE?.trim();
// live-lease 默认持续 120 秒并定时 heartbeat，用于证明租约容量可持续而非瞬时峰值。 / Keeps live leases heartbeating for 120 seconds by default to prove sustained rather than burst capacity.
const DEFAULT_DURATION_SECONDS = 120;
// 100 毫秒采样队列状态，降低漏掉 20 并发 active 峰值的概率。 / Samples queue state every 100 ms to reduce the chance of missing the 20-active concurrency peak.
const FINAL_LOAD_POLL_MS = 100;
// 最终转写全批最多等待一小时，超时视为容量验收失败。 / Allows one hour for the final-transcription batch; timeout fails capacity acceptance.
const FINAL_LOAD_TIMEOUT_MS = 60 * 60 * 1000;

// 恰好 100 个独立会话对应 100 条并发 live transcript 租约。 / Exactly 100 independent sessions map to 100 concurrent live-transcript leases.
const liveSessionCookiesSchema = z.array(z.string().min(1)).length(100);
// 仅提取服务端签发的双轨上传计划，后续 PUT 不信任未校验响应。 / Validates the server-issued two-track upload plan before performing any returned PUT.
const directUploadPlanSchema = z.object({
  uploads: z.array(
    z.object({
      headers: z.record(z.string(), z.string()),
      track: z.enum(["microphone", "system"]),
      url: z.string(),
    }),
  ),
});
// 压测结束后仅解析验收所需容量字段，避免脚本耦合完整诊断响应。 / Parses only capacity fields needed for acceptance so the script is not coupled to the full diagnostics payload.
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

// 为多用户 live 测试注入对应会话，并将任何非 2xx 立即转为压测失败。 / Injects each user's session for live testing and turns any non-2xx response into an immediate load-test failure.
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

// direct/final 模式的单会话包装，统一复用严格的 HTTP 状态检查。 / Single-session wrapper for direct/final modes that reuses strict HTTP status checking.
function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return apiFetchWithCookie(path, init, COOKIE);
}

// 从文件读取并校验 100 个会话，避免用同一用户绕过按成员计算的租约容量。 / Reads and validates 100 sessions from disk so one user cannot bypass member-scoped lease capacity.
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

// 并发建立 100 条租约、持续 heartbeat，再显式释放，验证准入与续租路径。 / Opens 100 leases concurrently, sustains heartbeats, then releases them to verify admission and renewal paths.
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

// 并发创建 100 个会议、直传双轨并 complete，覆盖签名上传与完成准入。 / Creates 100 meetings concurrently, uploads both tracks, and completes them to exercise signed upload and completion admission.
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

// 入队 20 个唯一作业并高频采样，要求全部终态且观测到 20 个同时 active，再核对运营容量。 / Enqueues 20 unique jobs, samples rapidly, requires all terminal plus 20 simultaneously active, then checks reported capacity.
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
