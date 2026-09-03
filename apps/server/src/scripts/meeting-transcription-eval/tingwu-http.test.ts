import { describe, expect, it, vi } from "vitest";
import { MeetingProviderQuotaError } from "../../server/routes/meetings/transcription/provider";
import { createTingwuHttpClient, signAlibabaCloudRequest } from "./tingwu-http";

describe("Tingwu benchmark HTTP client", () => {
  it("signs the exact method, path, query and body without exposing the secret", () => {
    const headers = signAlibabaCloudRequest({
      accessKeyId: "test-id",
      accessKeySecret: "test-secret",
      action: "CreateTask",
      body: '{"AppKey":"app"}',
      date: "2026-08-09T10:00:00Z",
      method: "PUT",
      nonce: "nonce-1",
      url: new URL("https://tingwu.cn-beijing.aliyuncs.com/openapi/tingwu/v2/tasks?type=offline"),
      version: "2023-09-30",
    });

    expect(headers.get("authorization")).toMatch(
      /^ACS3-HMAC-SHA256 Credential=test-id,SignedHeaders=.*Signature=[a-f\d]{64}$/,
    );
    expect(headers.get("authorization")).not.toContain("test-secret");
    expect(headers.get("x-acs-action")).toBe("CreateTask");
  });

  it("creates and polls an offline task while retaining only task identity and result URL", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json({ Code: "0", Data: { TaskId: "task-1" }, Message: "Success" }),
      )
      .mockResolvedValueOnce(
        Response.json({ Code: "0", Data: { TaskId: "task-1", TaskStatus: "ONGOING" } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          Code: "0",
          Data: {
            Result: { Transcription: "https://results.example/transcription.json" },
            TaskId: "task-1",
            TaskStatus: "COMPLETED",
          },
        }),
      );
    const onTaskCreated = vi.fn();
    const client = createTingwuHttpClient({
      accessKeyId: "test-id",
      accessKeySecret: "test-secret",
      appKey: "app-key",
      fetch,
      onTaskCreated,
      pollIntervalMs: 1,
    });
    const signal = AbortSignal.timeout(1000);

    await expect(
      client.createTask({
        audioUrl: "https://audio.example/case.webm",
        language: "fspk",
        model: "tingwu-offline",
        signal,
        taskKey: "case-01",
      }),
    ).resolves.toEqual({ taskId: "task-1" });
    await expect(client.pollTask("task-1", signal)).resolves.toEqual({
      resultUrl: "https://results.example/transcription.json",
      status: "COMPLETED",
    });
    expect(onTaskCreated).toHaveBeenCalledWith("task-1");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("classifies HTTP 429 as retryable provider quota evidence", async () => {
    const client = createTingwuHttpClient({
      accessKeyId: "test-id",
      accessKeySecret: "test-secret",
      appKey: "app-key",
      fetch: vi.fn(() => Promise.resolve(new Response(null, { status: 429 }))),
    });

    await expect(
      client.createTask({
        audioUrl: "https://audio.example/case.webm",
        language: "fspk",
        model: "tingwu-offline",
        signal: AbortSignal.timeout(1000),
        taskKey: "case-01",
      }),
    ).rejects.toBeInstanceOf(MeetingProviderQuotaError);
  });
});
