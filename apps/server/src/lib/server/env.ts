import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const SERVER_ENV_NAMES = [
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
  "FEISHU_EVALUATION_FOLDER_TOKEN",
  "FEISHU_JIGUANG_HR_EVALUATION_FOLDER_TOKEN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "INTERVIEW_EVALUATION_MODEL",
  "MINIMAX_TTS_BASE_URL",
  "NEXT_PUBLIC_BASE_URL",
  "QWEN_OCR_BASE_URL",
  "QWEN_OCR_MODEL",
  "RESUME_PARSE_PROVIDER",
  "RECORDING_R2_FORCE_PATH_STYLE",
  "RECORDING_R2_KEY_PREFIX",
  "RECORDING_R2_REGION",
  "S3_FORCE_PATH_STYLE",
  "S3_KEY_PREFIX",
  "S3_REGION",
] as const;

export type ServerEnvName = (typeof SERVER_ENV_NAMES)[number];

const nonEmptyString = z.string().trim().min(1);
const serverEnvSchema = {
  ALIBABA_BASE_URL: z.url(),
  ALIBABA_FAST_MODEL: nonEmptyString,
  ALIBABA_MODEL: nonEmptyString,
  ALIBABA_STRUCTURED_MODEL: nonEmptyString,
  BETTER_AUTH_SECRET: nonEmptyString,
  BETTER_AUTH_URL: z.url(),
  FEISHU_APP_ID: nonEmptyString,
  FEISHU_APP_ID2: nonEmptyString,
  FEISHU_APP_SECRET: nonEmptyString,
  FEISHU_APP_SECRET2: nonEmptyString,
  FEISHU_EVALUATION_FOLDER_TOKEN: nonEmptyString.optional(),
  FEISHU_JIGUANG_HR_EVALUATION_FOLDER_TOKEN: nonEmptyString.optional(),
  GOOGLE_CLIENT_ID: nonEmptyString,
  GOOGLE_CLIENT_SECRET: nonEmptyString,
  INTERVIEW_EVALUATION_MODEL: nonEmptyString,
  MINIMAX_TTS_BASE_URL: z.url(),
  NEXT_PUBLIC_BASE_URL: z.url(),
  QWEN_OCR_BASE_URL: z.url(),
  QWEN_OCR_MODEL: nonEmptyString,
  RECORDING_R2_FORCE_PATH_STYLE: nonEmptyString,
  RECORDING_R2_KEY_PREFIX: nonEmptyString,
  RECORDING_R2_REGION: nonEmptyString,
  RESUME_PARSE_PROVIDER: z.enum(["ocr-llm", "aliyun-docmining"]).default("ocr-llm"),
  S3_FORCE_PATH_STYLE: nonEmptyString,
  S3_KEY_PREFIX: nonEmptyString,
  S3_REGION: nonEmptyString,
} as const;

export function createServerEnv(runtimeEnv: Record<string, string | undefined>) {
  return createEnv({
    emptyStringAsUndefined: true,
    runtimeEnv,
    server: serverEnvSchema,
  });
}

export function validateServerEnv(): void {
  createServerEnv(process.env);
}

function parseBooleanEnv(name: ServerEnvName, value: string): boolean {
  if (value === "1" || value === "true" || value === "yes") {
    return true;
  }
  if (value === "0" || value === "false" || value === "no") {
    return false;
  }
  throw new Error(`${name} must be one of: 1, true, yes, 0, false, no.`);
}

export function getRequiredEnv(name: ServerEnvName): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export function getRequiredBooleanEnv(name: ServerEnvName): boolean {
  const value = getRequiredEnv(name).toLowerCase();
  return parseBooleanEnv(name, value);
}

export function getBooleanEnv(name: ServerEnvName, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return defaultValue;
  }
  return parseBooleanEnv(name, value);
}
