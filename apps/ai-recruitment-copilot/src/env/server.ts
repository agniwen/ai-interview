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
//
export type ServerEnvName = (typeof SERVER_ENV_NAMES)[number];

export function createServerEnv(runtimeEnv: Record<string, string | undefined>) {
  return createEnv({
    emptyStringAsUndefined: true,
    runtimeEnvStrict: {
      ALIBABA_BASE_URL: runtimeEnv.ALIBABA_BASE_URL,
      ALIBABA_FAST_MODEL: runtimeEnv.ALIBABA_FAST_MODEL,
      ALIBABA_MODEL: runtimeEnv.ALIBABA_MODEL,
      ALIBABA_STRUCTURED_MODEL: runtimeEnv.ALIBABA_STRUCTURED_MODEL,
      BETTER_AUTH_SECRET: runtimeEnv.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: runtimeEnv.BETTER_AUTH_URL,
      FEISHU_APP_ID: runtimeEnv.FEISHU_APP_ID,
      FEISHU_APP_ID2: runtimeEnv.FEISHU_APP_ID2,
      FEISHU_APP_SECRET: runtimeEnv.FEISHU_APP_SECRET,
      FEISHU_APP_SECRET2: runtimeEnv.FEISHU_APP_SECRET2,
      GOOGLE_CLIENT_ID: runtimeEnv.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: runtimeEnv.GOOGLE_CLIENT_SECRET,
      INTERVIEW_EVALUATION_MODEL: runtimeEnv.INTERVIEW_EVALUATION_MODEL,
      MINIMAX_TTS_BASE_URL: runtimeEnv.MINIMAX_TTS_BASE_URL,
      NEXT_PUBLIC_BASE_URL: runtimeEnv.NEXT_PUBLIC_BASE_URL,
      QWEN_OCR_BASE_URL: runtimeEnv.QWEN_OCR_BASE_URL,
      QWEN_OCR_MODEL: runtimeEnv.QWEN_OCR_MODEL,
      RECORDING_R2_FORCE_PATH_STYLE: runtimeEnv.RECORDING_R2_FORCE_PATH_STYLE,
      RECORDING_R2_KEY_PREFIX: runtimeEnv.RECORDING_R2_KEY_PREFIX,
      RECORDING_R2_REGION: runtimeEnv.RECORDING_R2_REGION,
      S3_FORCE_PATH_STYLE: runtimeEnv.S3_FORCE_PATH_STYLE,
      S3_KEY_PREFIX: runtimeEnv.S3_KEY_PREFIX,
      S3_REGION: runtimeEnv.S3_REGION,
    },
    server: {
      ALIBABA_BASE_URL: z.string().url(),
      ALIBABA_FAST_MODEL: z.string().min(1),
      ALIBABA_MODEL: z.string().min(1),
      ALIBABA_STRUCTURED_MODEL: z.string().min(1),
      BETTER_AUTH_SECRET: z.string().min(1),
      BETTER_AUTH_URL: z.string().url(),
      FEISHU_APP_ID: z.string().min(1),
      FEISHU_APP_ID2: z.string().min(1),
      FEISHU_APP_SECRET: z.string().min(1),
      FEISHU_APP_SECRET2: z.string().min(1),
      GOOGLE_CLIENT_ID: z.string().min(1),
      GOOGLE_CLIENT_SECRET: z.string().min(1),
      INTERVIEW_EVALUATION_MODEL: z.string().min(1),
      MINIMAX_TTS_BASE_URL: z.string().url(),
      NEXT_PUBLIC_BASE_URL: z.string().url(),
      QWEN_OCR_BASE_URL: z.string().url(),
      QWEN_OCR_MODEL: z.string().min(1),
      RECORDING_R2_FORCE_PATH_STYLE: z.string().min(1),
      RECORDING_R2_KEY_PREFIX: z.string().min(1),
      RECORDING_R2_REGION: z.string().min(1),
      S3_FORCE_PATH_STYLE: z.string().min(1),
      S3_KEY_PREFIX: z.string().min(1),
      S3_REGION: z.string().min(1),
    },
  });
}

export function applyServerEnv(
  target: Record<string, string | undefined> = process.env,
  source = createServerEnv(process.env),
) {
  for (const key of SERVER_ENV_NAMES) {
    target[key] = source[key];
  }
}
