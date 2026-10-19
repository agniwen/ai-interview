const TRUE_VALUES = new Set(["1", "true", "yes"]);

export interface ResumeParseConfigSummary {
  alibabaApiKeyConfigured: boolean;
  alibabaBaseUrlHost: string;
  cacheDisabled: boolean;
  ocrAttempts: string;
  ocrPageConcurrency: string;
  ocrRetryDelayMs: string;
  parseProvider: string;
  parseStepLogsEnabled: boolean;
  qwenOcrBaseUrlHost: string;
  qwenOcrModel: string;
  s3Configured: boolean;
  staleProcessingSeconds: string;
}

export function isResumeParseCacheDisabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return TRUE_VALUES.has(env.RESUME_PARSE_DISABLE_CACHE?.trim().toLowerCase() ?? "");
}

export function getResumeParseReadinessIssue(
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (!env.ALIBABA_API_KEY?.trim()) {
    return "ALIBABA_API_KEY is not set; live resume parsing cannot run.";
  }

  const missingS3Env = [
    "S3_BUCKET_NAME",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_ENDPOINT",
  ].filter((key) => !env[key]?.trim());
  if (missingS3Env.length > 0) {
    return `S3 storage env is incomplete: ${missingS3Env.join(", ")}.`;
  }

  return null;
}

function getUrlHost(raw: string | undefined, fallback: string): string {
  try {
    return new URL(raw?.trim() || fallback).host;
  } catch {
    return "invalid-url";
  }
}

function getEnvNumberString(raw: string | undefined, fallback: number): string {
  const value = raw?.trim();
  return value || String(fallback);
}

export function getResumeParseConfigSummary(
  env: Record<string, string | undefined> = process.env,
): ResumeParseConfigSummary {
  return {
    alibabaApiKeyConfigured: Boolean(env.ALIBABA_API_KEY?.trim()),
    alibabaBaseUrlHost: getUrlHost(
      env.ALIBABA_BASE_URL,
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    cacheDisabled: isResumeParseCacheDisabled(env),
    ocrAttempts: getEnvNumberString(env.RESUME_PARSE_OCR_ATTEMPTS, 3),
    ocrPageConcurrency: getEnvNumberString(env.RESUME_PARSE_OCR_PAGE_CONCURRENCY, 4),
    ocrRetryDelayMs: getEnvNumberString(env.RESUME_PARSE_OCR_RETRY_DELAY_MS, 1000),
    parseProvider: env.RESUME_PARSE_PROVIDER?.trim() || "ocr-llm",
    parseStepLogsEnabled: TRUE_VALUES.has(env.RESUME_PARSE_LOG_STEPS?.trim().toLowerCase() ?? ""),
    qwenOcrBaseUrlHost: getUrlHost(
      env.QWEN_OCR_BASE_URL,
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    qwenOcrModel: env.QWEN_OCR_MODEL?.trim() || "qwen-vl-ocr-latest",
    s3Configured: !getResumeParseReadinessIssue({ ...env, ALIBABA_API_KEY: "placeholder" }),
    staleProcessingSeconds: getEnvNumberString(env.RESUME_PARSE_STALE_PROCESSING_SECONDS, 900),
  };
}

const DEFAULT_RESUME_REVIEW_STALE_SECONDS = 600;
const DEFAULT_RESUME_REVIEW_RECOVERY_INTERVAL_SECONDS = 300;
const MAX_RESUME_REVIEW_RECOVERY_INTERVAL_SECONDS = 24 * 60 * 60;

function parseNonNegativeSeconds(raw: string | undefined, fallback: number): number {
  const value = Number(raw?.trim() || fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export interface ResumeReviewRecoveryConfig {
  /** 0 表示关闭定时巡检。0 disables the periodic sweep. */
  intervalMs: number;
  staleAfterMs: number;
}

/** 简历 AI 评价丢失任务的巡检配置。Sweep config for lost resume review runs. */
export function getResumeReviewRecoveryConfig(
  env: Record<string, string | undefined> = process.env,
): ResumeReviewRecoveryConfig {
  const staleSeconds = parseNonNegativeSeconds(
    env.RESUME_REVIEW_STALE_SECONDS,
    DEFAULT_RESUME_REVIEW_STALE_SECONDS,
  );
  const intervalSeconds = parseNonNegativeSeconds(
    env.RESUME_REVIEW_RECOVERY_INTERVAL_SECONDS,
    DEFAULT_RESUME_REVIEW_RECOVERY_INTERVAL_SECONDS,
  );
  return {
    // setInterval 超过约 24.8 天会被钳制为 1ms，这里上限取 1 天。
    // setInterval clamps delays above ~24.8 days to 1ms, so cap at one day.
    intervalMs: Math.min(intervalSeconds, MAX_RESUME_REVIEW_RECOVERY_INTERVAL_SECONDS) * 1000,
    // 阈值过小会与正常入队竞争，至少保留 1 分钟。Keep at least one minute to avoid racing enqueue.
    staleAfterMs: Math.max(staleSeconds, 60) * 1000,
  };
}
