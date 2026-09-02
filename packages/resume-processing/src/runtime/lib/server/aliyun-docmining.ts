import { createHash } from "node:crypto";
import { z } from "zod";
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

function apiEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({
    code: z.number(),
    data: data.optional(),
    message: z.string().optional(),
    success: z.boolean().optional(),
  });
}
const uploadLeaseSchema = z.object({
  lease_id: z.string(),
  param: z.object({
    headers: z.record(z.string(), z.string()),
    method: z.string(),
    url: z.string(),
  }),
});
const submitParseDataSchema = z.object({ fileId: z.string(), pageSize: z.number().optional() });
const extractionResponseSchema = z.object({
  output: z
    .object({
      choices: z
        .array(z.object({ message: z.object({ content: z.string().optional() }).optional() }))
        .optional(),
    })
    .optional(),
  usage: z
    .object({
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
      totalTokens: z.number().optional(),
    })
    .optional(),
});

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

type SleepPort = (milliseconds: number) => Promise<void>;

interface RunAliyunResumeExtractionInput {
  apiKey: string;
  bytes: Uint8Array;
  fetch?: typeof fetch;
  fileName: string;
  parseTimeoutMs?: number;
  prompt: string;
  sleep?: SleepPort;
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

const nonEmptyStringSchema = z.string().trim().min(1);
const finiteNumberSchema = z.coerce.number().finite();

function requiredString(value: string, label: string): string {
  const parsed = nonEmptyStringSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Aliyun response is missing ${label}.`);
  }
  return parsed.data;
}

async function readJsonResponse<T>(
  response: Response,
  label: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const responseBody = await response.text();
  if (!response.ok) {
    throw new AliyunDocminingError(
      `${label} failed with HTTP ${response.status}.`,
      response.status,
      responseBody,
    );
  }
  try {
    return schema.parse(JSON.parse(responseBody));
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

function isFileParsingInProgress(error: Error): boolean {
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
    const result = await readJsonResponse(response, "delete file", apiEnvelopeSchema(z.unknown()));
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
  const envelope = await readJsonResponse(
    response,
    "apply upload lease",
    apiEnvelopeSchema(uploadLeaseSchema),
  );
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
  const envelope = await readJsonResponse(
    response,
    "submit parse file",
    apiEnvelopeSchema(submitParseDataSchema),
  );
  return assertSuccessfulEnvelope(envelope, "submit parse file");
}

async function extractResumeWithRetry(input: {
  apiKey: string;
  fetch: typeof fetch;
  fileId: string;
  parseTimeoutMs: number;
  prompt: string;
  sleep: SleepPort;
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
        extraction: await readJsonResponse(response, "resume extraction", extractionResponseSchema),
      };
    } catch (error) {
      if (!(error instanceof Error) || !isFileParsingInProgress(error)) {
        throw error;
      }
      await input.sleep(Math.min(attempts * 1000, 5000));
    }
  }
  throw new Error(`Aliyun resume extraction timed out after ${input.parseTimeoutMs}ms.`);
}

function finiteNumberOrNull(value: number | string): number | null {
  const parsed = finiteNumberSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
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
      extraction.output?.choices?.[0]?.message?.content ?? "",
      "extraction content",
    );
    result = {
      content,
      extractionAttempts: attempts,
      pageCount: parseData.pageSize === undefined ? null : finiteNumberOrNull(parseData.pageSize),
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
