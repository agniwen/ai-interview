export const REQUIRED_SERVER_ENV_NAMES = [
  "ALIBABA_BASE_URL",
  "ALIBABA_FAST_MODEL",
  "ALIBABA_MODEL",
  "ALIBABA_STRUCTURED_MODEL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "FEISHU_APP_ID",
  "FEISHU_APP_ID2",
  "FEISHU_APP_SECRET",
  "FEISHU_APP_SECRET2",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "INTERVIEW_EVALUATION_MODEL",
  "MINIMAX_TTS_BASE_URL",
  "NEXT_PUBLIC_BASE_URL",
  "QWEN_OCR_BASE_URL",
  "QWEN_OCR_MODEL",
  "RECORDING_R2_FORCE_PATH_STYLE",
  "RECORDING_R2_KEY_PREFIX",
  "RECORDING_R2_REGION",
  "S3_FORCE_PATH_STYLE",
  "S3_KEY_PREFIX",
  "S3_REGION",
] as const;

export type RequiredServerEnvName = (typeof REQUIRED_SERVER_ENV_NAMES)[number];

export function getRequiredEnv(name: RequiredServerEnvName): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export function getRequiredBooleanEnv(name: RequiredServerEnvName): boolean {
  const value = getRequiredEnv(name).toLowerCase();
  if (value === "1" || value === "true" || value === "yes") {
    return true;
  }
  if (value === "0" || value === "false" || value === "no") {
    return false;
  }
  throw new Error(`${name} must be one of: 1, true, yes, 0, false, no.`);
}
