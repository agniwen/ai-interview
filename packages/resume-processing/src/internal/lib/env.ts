const RESUME_PROCESSING_ENV_NAMES = ["QWEN_OCR_BASE_URL", "QWEN_OCR_MODEL"] as const;

export type ResumeProcessingEnvName = (typeof RESUME_PROCESSING_ENV_NAMES)[number];

export function getRequiredEnv(name: ResumeProcessingEnvName): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}
