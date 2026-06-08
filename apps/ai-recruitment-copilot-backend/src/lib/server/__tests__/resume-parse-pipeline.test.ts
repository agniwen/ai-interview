import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  qwenVlOcr: vi.fn(),
  rasterizePdfWithMeta: vi.fn(),
}));

vi.mock("../pdf-rasterize", () => ({
  rasterizePdfWithMeta: mocks.rasterizePdfWithMeta,
}));

vi.mock("../qwen-ocr", () => ({
  isQwenOcrConfigured: () => true,
  qwenVlOcr: mocks.qwenVlOcr,
}));

const { parseResumeOcrOnly } = await import("../resume-parse-pipeline");

describe("parseResumeOcrOnly", () => {
  const originalConcurrency = process.env.RESUME_PARSE_OCR_PAGE_CONCURRENCY;
  const originalAttempts = process.env.RESUME_PARSE_OCR_ATTEMPTS;
  const originalRetryDelay = process.env.RESUME_PARSE_OCR_RETRY_DELAY_MS;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESUME_PARSE_OCR_PAGE_CONCURRENCY = "1";
    process.env.RESUME_PARSE_OCR_ATTEMPTS = "2";
    process.env.RESUME_PARSE_OCR_RETRY_DELAY_MS = "0";
    mocks.rasterizePdfWithMeta.mockResolvedValue({
      pageCount: 3,
      pages: [Buffer.from("page-1"), Buffer.from("page-2"), Buffer.from("page-3")],
    });
  });

  afterEach(() => {
    if (originalConcurrency === undefined) {
      delete process.env.RESUME_PARSE_OCR_PAGE_CONCURRENCY;
    } else {
      process.env.RESUME_PARSE_OCR_PAGE_CONCURRENCY = originalConcurrency;
    }
    if (originalAttempts === undefined) {
      delete process.env.RESUME_PARSE_OCR_ATTEMPTS;
    } else {
      process.env.RESUME_PARSE_OCR_ATTEMPTS = originalAttempts;
    }
    if (originalRetryDelay === undefined) {
      delete process.env.RESUME_PARSE_OCR_RETRY_DELAY_MS;
    } else {
      process.env.RESUME_PARSE_OCR_RETRY_DELAY_MS = originalRetryDelay;
    }
  });

  it("limits OCR page concurrency from env", async () => {
    let active = 0;
    let maxActive = 0;
    mocks.qwenVlOcr.mockImplementation(async (png: Buffer) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(1);
      active -= 1;
      return png.toString();
    });

    const result = await parseResumeOcrOnly(new Uint8Array([1, 2, 3]));

    expect(result.text).toBe("page-1\n\npage-2\n\npage-3");
    expect(maxActive).toBe(1);
  });

  it("retries transient OCR connection errors", async () => {
    mocks.qwenVlOcr
      .mockRejectedValueOnce(new Error("Connection error."))
      .mockResolvedValueOnce("page-1")
      .mockResolvedValueOnce("page-2")
      .mockResolvedValueOnce("page-3");

    const result = await parseResumeOcrOnly(new Uint8Array([1, 2, 3]));

    expect(result.text).toBe("page-1\n\npage-2\n\npage-3");
    expect(mocks.qwenVlOcr).toHaveBeenCalledTimes(4);
  });
});
