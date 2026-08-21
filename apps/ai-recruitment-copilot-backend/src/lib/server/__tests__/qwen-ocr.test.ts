import { afterEach, describe, expect, it } from "vitest";
import { buildQwenOcrRequest } from "@arc/ai-recruitment-copilot-backend/lib/server/qwen-ocr";

describe("Qwen OCR request", () => {
  const originalModel = process.env.QWEN_OCR_MODEL;

  afterEach(() => {
    if (originalModel === undefined) {
      delete process.env.QWEN_OCR_MODEL;
    } else {
      process.env.QWEN_OCR_MODEL = originalModel;
    }
  });

  it("forces thinking off", () => {
    process.env.QWEN_OCR_MODEL = "qwen-vl-ocr";

    expect(buildQwenOcrRequest(Buffer.from("image"), "image/png")).toMatchObject({
      enable_thinking: false,
      model: "qwen-vl-ocr",
      temperature: 0,
    });
  });
});
