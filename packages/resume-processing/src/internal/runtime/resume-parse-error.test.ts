import { afterEach, describe, expect, it, vi } from "vitest";
import { describeResumeParseError } from "./resume-parse-error";

afterEach(() => vi.unstubAllEnvs());

describe("resume parse failure diagnostics", () => {
  it("preserves provider metadata through a wrapped error", () => {
    const providerError = Object.assign(new Error("404 Model not exist."), {
      code: "model_not_found",
      request_id: "request-123",
      status: 404,
    });
    const error = describeResumeParseError(
      new Error("Generation failed", { cause: providerError }),
      {
        endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: "alibaba/deepseek-v4-flash-0731",
        stage: "简历结构化",
      },
    );
    expect(error.message).toContain("简历结构化");
    expect(error.message).toContain("deepseek-v4-flash-0731");
    expect(error.message).toContain("dashscope.aliyuncs.com/compatible-mode/v1");
    expect(error.message).toContain("HTTP=404");
    expect(error.message).toContain("code=model_not_found");
    expect(error.message).toContain("requestId=request-123");
    expect(error.message).toContain("Model not exist.");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("redacts credentials and excludes request and response bodies", () => {
    vi.stubEnv("ALIBABA_API_KEY", "test-provider-secret");
    const error = describeResumeParseError(
      Object.assign(new Error("Bearer test-provider-secret"), {
        requestBody: "private resume text",
        responseBody: "private response text",
        responseHeaders: { "x-request-id": "request-456" },
        statusCode: 404,
      }),
      {
        endpoint: "https://user:password@example.test/v1?api_key=another-secret#token",
        model: "test-model",
        stage: "OCR 第 2 页",
      },
    );
    expect(error.message).toContain("https://example.test/v1");
    expect(error.message).toContain("requestId=request-456");
    for (const secret of [
      "test-provider-secret",
      "another-secret",
      "password",
      "private resume",
      "private response",
    ]) {
      expect(error.message).not.toContain(secret);
    }
  });
});
