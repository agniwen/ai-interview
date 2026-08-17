import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "@arc/db-schema/json";
import { runAliyunResumeExtraction } from "../../lib/server/aliyun-docmining";

function jsonResponse(body: JsonValue, status = 200) {
  return Response.json(body, { status });
}

describe("runAliyunResumeExtraction", () => {
  it("uploads, retries while parsing, extracts, and deletes the remote file", async () => {
    const calls: { body: BodyInit | null | undefined; headers: Headers; url: string }[] = [];
    const responses = [
      jsonResponse({
        code: 200,
        data: {
          lease_id: "lease-1",
          param: {
            headers: {
              "Content-Type": "application/pdf",
              "x-bailian-extra": "extra",
            },
            method: "PUT",
            url: "https://example.test/upload",
          },
        },
        success: true,
      }),
      new Response(null, { status: 200 }),
      jsonResponse({
        code: 200,
        data: { fileId: "file_zhiwen_1", pageSize: 2 },
        success: true,
      }),
      jsonResponse(
        {
          code: "InvalidParameter.File",
          message: "file parsing in progress",
          success: false,
        },
        400,
      ),
      jsonResponse({
        output: {
          choices: [{ message: { content: '{"name":"韩先生"}' } }],
        },
        requestId: "request-1",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
      jsonResponse({ code: 200, success: true }),
    ];
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      calls.push({
        body: init?.body,
        headers: new Headers(init?.headers),
        url: String(input),
      });
      const response = responses.shift();
      if (!response) {
        throw new Error("Unexpected request");
      }
      return Promise.resolve(response);
    });
    const sleep = vi.fn(() => Promise.resolve());

    const result = await runAliyunResumeExtraction({
      apiKey: "test-key",
      bytes: new Uint8Array([1, 2, 3]),
      fetch: fetchMock,
      fileName: "resume.pdf",
      parseTimeoutMs: 30_000,
      prompt: "extract",
      sleep,
    });

    expect(result.content).toBe('{"name":"韩先生"}');
    expect(result.pageCount).toBe(2);
    expect(result.extractionAttempts).toBe(2);
    expect(result.cleanup).toEqual({ deleted: true });
    expect(sleep).toHaveBeenCalledOnce();
    expect(calls.map((call) => call.url)).toEqual([
      "https://dashscope.aliyuncs.com/api/v2/apps/zhiwen-file/apply_upload_lease",
      "https://example.test/upload",
      "https://dashscope.aliyuncs.com/api/v2/apps/zhiwen-file/submit_parse_file",
      "https://dashscope.aliyuncs.com/api/v2/apps/zhiwen-chat/extraction",
      "https://dashscope.aliyuncs.com/api/v2/apps/zhiwen-chat/extraction",
      "https://dashscope.aliyuncs.com/api/v2/apps/zhiwen-file/delete_file",
    ]);
    expect(calls[0]?.headers.get("Authorization")).toBe("test-key");
    expect(calls[1]?.headers.get("Authorization")).toBeNull();
    expect(calls[1]?.headers.get("x-bailian-extra")).toBe("extra");
    expect(JSON.parse(String(calls[3]?.body))).toMatchObject({
      capabilityType: "RESUME_EXTRACTION",
      fileIdList: ["file_zhiwen_1"],
      stream: false,
      userPrompt: "extract",
    });
  });
});
