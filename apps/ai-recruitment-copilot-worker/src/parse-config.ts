const TRUE_VALUES = new Set(["1", "true", "yes"]);

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
): Record<string, boolean | string> {
  return {
    alibabaApiKeyConfigured: Boolean(env.ALIBABA_API_KEY?.trim()),
    alibabaBaseUrlHost: getUrlHost(
      env.ALIBABA_BASE_URL,
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    cacheDisabled: isResumeParseCacheDisabled(env),
    ocrAttempts: getEnvNumberString(env.RESUME_PARSE_OCR_ATTEMPTS, 3),
    ocrPageConcurrency: getEnvNumberString(env.RESUME_PARSE_OCR_PAGE_CONCURRENCY, 1),
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
