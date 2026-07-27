import { afterEach, describe, expect, it } from "vitest";
import {
  getResumeParseProvider,
  isResumeParseCacheSourceCompatible,
} from "../resume-parse-provider";

const originalProvider = process.env.RESUME_PARSE_PROVIDER;

afterEach(() => {
  if (originalProvider === undefined) {
    delete process.env.RESUME_PARSE_PROVIDER;
  } else {
    process.env.RESUME_PARSE_PROVIDER = originalProvider;
  }
});

describe("getResumeParseProvider", () => {
  it("defaults to the existing OCR + LLM pipeline", () => {
    delete process.env.RESUME_PARSE_PROVIDER;

    expect(getResumeParseProvider()).toBe("ocr-llm");
  });

  it.each(["ocr-llm", "aliyun-docmining"] as const)("accepts %s", (provider) => {
    process.env.RESUME_PARSE_PROVIDER = provider;

    expect(getResumeParseProvider()).toBe(provider);
  });

  it("rejects unknown providers", () => {
    process.env.RESUME_PARSE_PROVIDER = "unknown";

    expect(() => getResumeParseProvider()).toThrow(
      "RESUME_PARSE_PROVIDER must be one of: ocr-llm, aliyun-docmining",
    );
  });
});

describe("isResumeParseCacheSourceCompatible", () => {
  it("only reuses cache entries produced by the selected provider", () => {
    expect(
      isResumeParseCacheSourceCompatible("aliyun-docmining", {
        RESUME_PARSE_PROVIDER: "aliyun-docmining",
      }),
    ).toBe(true);
    expect(
      isResumeParseCacheSourceCompatible("qwen-ocr", {
        RESUME_PARSE_PROVIDER: "aliyun-docmining",
      }),
    ).toBe(false);
    expect(
      isResumeParseCacheSourceCompatible("aliyun-docmining", {
        RESUME_PARSE_PROVIDER: "ocr-llm",
      }),
    ).toBe(false);
    expect(
      isResumeParseCacheSourceCompatible("docx-text", {
        RESUME_PARSE_PROVIDER: "ocr-llm",
      }),
    ).toBe(true);
  });
});
