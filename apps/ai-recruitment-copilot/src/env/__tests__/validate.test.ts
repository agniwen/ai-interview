import { describe, expect, it } from "vitest";
import { validateEnv } from "../validate";
import { expectEnvValidationToThrow } from "./expect-env-validation-throw";

const configuredEnv = {
  ALIBABA_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  ALIBABA_FAST_MODEL: "deepseek-v4-flash-0731",
  ALIBABA_MODEL: "deepseek-v4-flash-0731",
  ALIBABA_STRUCTURED_MODEL: "deepseek-v4-flash-0731",
  BETTER_AUTH_SECRET: "better-auth-secret",
  BETTER_AUTH_URL: "https://app.example.com",
  FEISHU_APP_ID: "feishu-app-id",
  FEISHU_APP_ID2: "feishu-app-id-2",
  FEISHU_APP_SECRET: "feishu-app-secret",
  FEISHU_APP_SECRET2: "feishu-app-secret-2",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  INTERVIEW_EVALUATION_MODEL: "google/gemini-2.5-flash",
  MINIMAX_TTS_BASE_URL: "https://api.minimax.chat",
  NEXT_PUBLIC_AGENT_NAME: "interview-agent",
  NEXT_PUBLIC_BASE_URL: "https://app.example.com",
  NEXT_PUBLIC_BETTER_AUTH_URL: "https://app.example.com",
  NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: "false",
  QWEN_OCR_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  QWEN_OCR_MODEL: "qwen-vl-ocr-latest",
  RECORDING_R2_FORCE_PATH_STYLE: "true",
  RECORDING_R2_KEY_PREFIX: "recordings",
  RECORDING_R2_REGION: "auto",
  S3_FORCE_PATH_STYLE: "false",
  S3_KEY_PREFIX: "uploads",
  S3_REGION: "auto",
};

describe("env validation", () => {
  it("requires all server and client env values before build", () => {
    expectEnvValidationToThrow(() => validateEnv({}));

    expect(() => validateEnv(configuredEnv)).not.toThrow();
  });
});
