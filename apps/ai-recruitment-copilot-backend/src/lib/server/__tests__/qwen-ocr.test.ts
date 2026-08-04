import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  responsesCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { create: mocks.responsesCreate };
  },
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for the SDK client.
import { qwenPdfOcr, qwenVlOcr } from "../qwen-ocr";

describe("qwenPdfOcr", () => {
  beforeEach(() => {
    mocks.responsesCreate.mockReset();
    process.env.ALIBABA_API_KEY = "test-key";
    process.env.QWEN_OCR_BASE_URL = "https://workspace.example.test/compatible-mode/v1";
    process.env.QWEN_OCR_MODEL = "qwen3.5-ocr";
  });

  it("submits a PDF URL as one document_parsing Responses request", async () => {
    mocks.responsesCreate.mockResolvedValue({
      output: [{ content: [{ ocr_result: "完整简历文本" }] }],
    });

    await expect(
      qwenPdfOcr("https://storage.example.test/resume.pdf?signature=secret"),
    ).resolves.toBe("完整简历文本");
    expect(mocks.responsesCreate).toHaveBeenCalledWith({
      input: [
        {
          content: [
            {
              file_url: "https://storage.example.test/resume.pdf?signature=secret",
              type: "input_file",
            },
          ],
          role: "user",
          type: "message",
        },
      ],
      model: "qwen3.5-ocr",
      ocr_options: { task: "document_parsing" },
    });
  });

  it("rejects a runtime model override that would mislabel cached OCR results", async () => {
    process.env.QWEN_OCR_MODEL = "qwen-vl-ocr-latest";

    await expect(qwenPdfOcr("https://storage.example.test/resume.pdf")).rejects.toThrow(
      'must be configured as "qwen3.5-ocr"',
    );
    expect(mocks.responsesCreate).not.toHaveBeenCalled();
  });

  it("rejects image data URLs above Qwen's 10 MB Base64 limit", async () => {
    await expect(qwenVlOcr(Buffer.alloc(8 * 1024 * 1024), "image/png")).rejects.toThrow(
      "Base64 图片输入不能超过 10 MB",
    );
  });
});
