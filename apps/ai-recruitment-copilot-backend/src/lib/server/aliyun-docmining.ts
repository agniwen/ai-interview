import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// Alibaba Cloud Model Studio document mining upload and extraction client.
const API_BASE_URL = "https://dashscope.aliyuncs.com/api/v2/apps";
const APPLY_UPLOAD_LEASE_URL = `${API_BASE_URL}/zhiwen-file/apply_upload_lease`;
const SUBMIT_PARSE_FILE_URL = `${API_BASE_URL}/zhiwen-file/submit_parse_file`;
const EXTRACTION_URL = `${API_BASE_URL}/zhiwen-chat/extraction`;
const DELETE_FILE_URL = `${API_BASE_URL}/zhiwen-file/delete_file`;
const MAX_PROMPT_LENGTH = 8000;

interface ApiEnvelope<T> {
  code?: number | string;
  data?: T;
  message?: string;
  success?: boolean;
}

interface UploadLease {
  lease_id: string;
  param: {
    headers: Record<string, string>;
    method: string;
    url: string;
  };
}

interface SubmitParseData {
  fileId: string;
  pageSize?: number;
}

interface ExtractionResponse {
  output?: {
    choices?: {
      message?: {
        content?: string;
      };
    }[];
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

interface CleanupResult {
  deleted: boolean;
  error?: string;
}

export interface AliyunResumeExtractionResult {
  cleanup: CleanupResult;
  content: string;
  extractionAttempts: number;
  pageCount: number | null;
  timingsMs: {
    applyLease: number;
    extraction: number;
    ossUpload: number;
    submitParse: number;
    total: number;
  };
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
}

interface RunAliyunResumeExtractionInput {
  apiKey: string;
  bytes: Uint8Array;
  fetch?: typeof fetch;
  fileName: string;
  parseTimeoutMs?: number;
  prompt: string;
  sleep?: (milliseconds: number) => Promise<unknown>;
}

class AliyunDocminingError extends Error {
  readonly responseBody: string;
  readonly status: number;

  constructor(message: string, status: number, responseBody: string) {
    super(message);
    this.name = "AliyunDocminingError";
    this.responseBody = responseBody;
    this.status = status;
  }
}

function elapsed(startedAt: number) {
  return Math.round(performance.now() - startedAt);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Aliyun response is missing ${label}.`);
  }
  return value;
}

async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  const responseBody = await response.text();
  if (!response.ok) {
    throw new AliyunDocminingError(
      `${label} failed with HTTP ${response.status}.`,
      response.status,
      responseBody,
    );
  }
  try {
    return JSON.parse(responseBody) as T;
  } catch (error) {
    throw new Error(`${label} returned invalid JSON.`, { cause: error });
  }
}

function assertSuccessfulEnvelope<T>(envelope: ApiEnvelope<T>, label: string): T {
  if (envelope.success === false || envelope.code !== 200 || !envelope.data) {
    throw new Error(`${label} failed: ${envelope.message ?? `code ${String(envelope.code)}`}`);
  }
  return envelope.data;
}

function isFileParsingInProgress(error: unknown): boolean {
  return (
    error instanceof AliyunDocminingError &&
    error.status === 400 &&
    error.responseBody.toLowerCase().includes("file parsing in progress")
  );
}

async function deleteRemoteFile(input: {
  apiKey: string;
  fetch: typeof fetch;
  fileId: string;
}): Promise<CleanupResult> {
  try {
    const response = await input.fetch(DELETE_FILE_URL, {
      body: JSON.stringify({ fileId: input.fileId }),
      headers: {
        Authorization: input.apiKey,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const result = await readJsonResponse<ApiEnvelope<unknown>>(response, "delete file");
    if (result.success === false || result.code !== 200) {
      return {
        deleted: false,
        error: result.message ?? `code ${String(result.code)}`,
      };
    }
    return { deleted: true };
  } catch (error) {
    return {
      deleted: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function applyUploadLease(input: {
  apiKey: string;
  bytes: Uint8Array;
  fetch: typeof fetch;
  fileName: string;
}): Promise<UploadLease> {
  const response = await input.fetch(APPLY_UPLOAD_LEASE_URL, {
    body: JSON.stringify({
      fileName: input.fileName,
      md5: createHash("md5").update(input.bytes).digest("hex"),
      sizeBytes: input.bytes.byteLength,
    }),
    headers: {
      Authorization: input.apiKey,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const envelope = await readJsonResponse<ApiEnvelope<UploadLease>>(response, "apply upload lease");
  return assertSuccessfulEnvelope(envelope, "apply upload lease");
}

async function uploadToOss(input: {
  bytes: Uint8Array;
  fetch: typeof fetch;
  lease: UploadLease;
}): Promise<void> {
  const response = await input.fetch(requiredString(input.lease.param.url, "upload URL"), {
    body: Uint8Array.from(input.bytes).buffer,
    headers: input.lease.param.headers,
    method: requiredString(input.lease.param.method, "upload method"),
  });
  if (!response.ok) {
    throw new Error(`OSS upload failed with HTTP ${response.status}.`);
  }
}

async function submitParseFile(input: {
  apiKey: string;
  fetch: typeof fetch;
  leaseId: string;
}): Promise<SubmitParseData> {
  const response = await input.fetch(SUBMIT_PARSE_FILE_URL, {
    body: JSON.stringify({ leaseId: input.leaseId }),
    headers: {
      Authorization: input.apiKey,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const envelope = await readJsonResponse<ApiEnvelope<SubmitParseData>>(
    response,
    "submit parse file",
  );
  return assertSuccessfulEnvelope(envelope, "submit parse file");
}

async function extractResumeWithRetry(input: {
  apiKey: string;
  fetch: typeof fetch;
  fileId: string;
  parseTimeoutMs: number;
  prompt: string;
  sleep: (milliseconds: number) => Promise<unknown>;
}): Promise<{ attempts: number; extraction: ExtractionResponse }> {
  const deadline = performance.now() + input.parseTimeoutMs;
  let attempts = 0;
  while (performance.now() < deadline) {
    attempts += 1;
    try {
      const response = await input.fetch(EXTRACTION_URL, {
        body: JSON.stringify({
          capabilityType: "RESUME_EXTRACTION",
          fileIdList: [input.fileId],
          stream: false,
          userPrompt: input.prompt,
        }),
        headers: {
          Authorization: input.apiKey,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      return {
        attempts,
        extraction: await readJsonResponse<ExtractionResponse>(response, "resume extraction"),
      };
    } catch (error) {
      if (!isFileParsingInProgress(error)) {
        throw error;
      }
      await input.sleep(Math.min(attempts * 1000, 5000));
    }
  }
  throw new Error(`Aliyun resume extraction timed out after ${input.parseTimeoutMs}ms.`);
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function runAliyunResumeExtraction(
  input: RunAliyunResumeExtractionInput,
): Promise<AliyunResumeExtractionResult> {
  if (!input.apiKey.trim()) {
    throw new Error("ALIBABA_API_KEY is required.");
  }
  if (input.prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Aliyun userPrompt must not exceed ${MAX_PROMPT_LENGTH} characters.`);
  }

  const fetchImpl = input.fetch ?? fetch;
  const sleep = input.sleep ?? delay;
  const parseTimeoutMs = input.parseTimeoutMs ?? 120_000;
  const totalStartedAt = performance.now();
  const timingsMs = {
    applyLease: 0,
    extraction: 0,
    ossUpload: 0,
    submitParse: 0,
    total: 0,
  };
  let fileId: string | null = null;
  let cleanup: CleanupResult = { deleted: false };
  let result: Omit<AliyunResumeExtractionResult, "cleanup"> | null = null;

  try {
    const applyLeaseStartedAt = performance.now();
    const lease = await applyUploadLease({
      apiKey: input.apiKey,
      bytes: input.bytes,
      fetch: fetchImpl,
      fileName: input.fileName,
    });
    timingsMs.applyLease = elapsed(applyLeaseStartedAt);

    const uploadStartedAt = performance.now();
    await uploadToOss({ bytes: input.bytes, fetch: fetchImpl, lease });
    timingsMs.ossUpload = elapsed(uploadStartedAt);

    const submitParseStartedAt = performance.now();
    const parseData = await submitParseFile({
      apiKey: input.apiKey,
      fetch: fetchImpl,
      leaseId: requiredString(lease.lease_id, "lease ID"),
    });
    fileId = requiredString(parseData.fileId, "file ID");
    timingsMs.submitParse = elapsed(submitParseStartedAt);

    const extractionStartedAt = performance.now();
    const { attempts, extraction } = await extractResumeWithRetry({
      apiKey: input.apiKey,
      fetch: fetchImpl,
      fileId,
      parseTimeoutMs,
      prompt: input.prompt,
      sleep,
    });
    timingsMs.extraction = elapsed(extractionStartedAt);
    timingsMs.total = elapsed(totalStartedAt);

    const content = requiredString(
      extraction.output?.choices?.[0]?.message?.content,
      "extraction content",
    );
    result = {
      content,
      extractionAttempts: attempts,
      pageCount: finiteNumberOrNull(parseData.pageSize),
      timingsMs,
      usage: {
        inputTokens: extraction.usage?.inputTokens ?? null,
        outputTokens: extraction.usage?.outputTokens ?? null,
        totalTokens: extraction.usage?.totalTokens ?? null,
      },
    };
  } finally {
    if (fileId) {
      cleanup = await deleteRemoteFile({
        apiKey: input.apiKey,
        fetch: fetchImpl,
        fileId,
      });
    }
  }

  if (!result) {
    throw new Error("Aliyun resume extraction did not produce a result.");
  }
  return { ...result, cleanup };
}
