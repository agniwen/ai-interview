import { afterEach, describe, expect, it } from "vitest";
import { applyServerEnv, createServerEnv } from "../server";
import { expectEnvValidationToThrow } from "./expect-env-validation-throw";

const ORIGINAL_ALIBABA_MODEL = process.env.ALIBABA_MODEL;

afterEach(() => {
  process.env.ALIBABA_MODEL = ORIGINAL_ALIBABA_MODEL;
});

describe("server env", () => {
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
    NEXT_PUBLIC_BASE_URL: "https://app.example.com",
    QWEN_OCR_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    QWEN_OCR_MODEL: "qwen-vl-ocr-latest",
    RECORDING_R2_FORCE_PATH_STYLE: "true",
    RECORDING_R2_KEY_PREFIX: "recordings",
    RECORDING_R2_REGION: "auto",
    RESUME_PARSE_PROVIDER: "aliyun-docmining",
    S3_FORCE_PATH_STYLE: "false",
    S3_KEY_PREFIX: "uploads",
    S3_REGION: "auto",
  };

  it("requires configured model and endpoint values for the TanStack Start server", () => {
    expectEnvValidationToThrow(() => createServerEnv({}));

    const env = createServerEnv(configuredEnv);

    expect(env.ALIBABA_MODEL).toBe("deepseek-v4-flash-0731");
    expect(env.NEXT_PUBLIC_BASE_URL).toBe("https://app.example.com");
    expect(env.RESUME_PARSE_PROVIDER).toBe("aliyun-docmining");
    expect(env.S3_FORCE_PATH_STYLE).toBe("false");
  });

  it("writes validated values back to process env for the mounted Hono backend", () => {
    const target: Record<string, string | undefined> = {};

    applyServerEnv(target, createServerEnv(configuredEnv));

    expect(target).toMatchObject({
      ALIBABA_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      ALIBABA_FAST_MODEL: "deepseek-v4-flash-0731",
      ALIBABA_MODEL: "deepseek-v4-flash-0731",
      ALIBABA_STRUCTURED_MODEL: "deepseek-v4-flash-0731",
      BETTER_AUTH_SECRET: "better-auth-secret",
      BETTER_AUTH_URL: "https://app.example.com",
      INTERVIEW_EVALUATION_MODEL: "google/gemini-2.5-flash",
      MINIMAX_TTS_BASE_URL: "https://api.minimax.chat",
      NEXT_PUBLIC_BASE_URL: "https://app.example.com",
      QWEN_OCR_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      QWEN_OCR_MODEL: "qwen-vl-ocr-latest",
      RESUME_PARSE_PROVIDER: "aliyun-docmining",
      S3_FORCE_PATH_STYLE: "false",
    });
  });

  it("reads process env at call time instead of module load time", () => {
    const target: Record<string, string | undefined> = {};

    process.env.ALIBABA_MODEL = "per-request-model";
    applyServerEnv(target);

    expect(target.ALIBABA_MODEL).toBe("per-request-model");
  });
});
