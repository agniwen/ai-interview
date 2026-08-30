import { describe, expect, it } from "vitest";
import { forceDiagnosticNonOcrModels, parseDiagnosticOptions } from "./diagnose-structured-resume";

describe("parseDiagnosticOptions", () => {
  it("targets Jin Wenhui by default", () => {
    expect(parseDiagnosticOptions([])).toEqual({ candidateName: "金文辉" });
  });

  it("supports selecting an exact resume", () => {
    expect(parseDiagnosticOptions(["--resume-id", "resume-1"])).toEqual({
      candidateName: "金文辉",
      resumeId: "resume-1",
    });
  });

  it("rejects model and output overrides", () => {
    expect(() => parseDiagnosticOptions(["--model=model-x"])).toThrow("未知参数");
    expect(() => parseDiagnosticOptions(["--output=/tmp/report.json"])).toThrow("未知参数");
  });

  it("forces every non-OCR model to DeepSeek V4 Flash 0731 without changing OCR", () => {
    const env = {
      MASTRA_CHAT_MODEL: "old-chat",
      MASTRA_FAST_MODEL: "old-fast",
      MASTRA_LONG_CONTEXT_MODEL: "old-long",
      MASTRA_SCORER_MODEL: "old-scorer",
      MASTRA_STRUCTURED_MODEL: "old-structured",
      QWEN_OCR_MODEL: "env-ocr-model",
    };

    forceDiagnosticNonOcrModels(env);

    expect(env).toEqual({
      MASTRA_CHAT_MODEL: "deepseek-v4-flash-0731",
      MASTRA_FAST_MODEL: "deepseek-v4-flash-0731",
      MASTRA_LONG_CONTEXT_MODEL: "deepseek-v4-flash-0731",
      MASTRA_SCORER_MODEL: "deepseek-v4-flash-0731",
      MASTRA_STRUCTURED_MODEL: "deepseek-v4-flash-0731",
      QWEN_OCR_MODEL: "env-ocr-model",
    });
  });
});
