import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { MEETING_ANSWER_REQUEST_BODY_MAX_BYTES } from "@arc/shared/meeting-answer";

const mocks = vi.hoisted(() => ({
  ask: vi.fn(),
  createThread: vi.fn(),
  getThread: vi.fn(),
  listThreads: vi.fn(),
}));

vi.mock("../../answers/service", () => ({
  askMeetingQuestion: mocks.ask,
  createSavedMeetingQuestionThread: mocks.createThread,
  getSavedMeetingQuestionThread: mocks.getThread,
  listSavedMeetingQuestionThreads: mocks.listThreads,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import { meetingQuestionsRouter } from "./route";

function app() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("activeOrg", { id: "org-81" } as never);
      c.set("member", { role: "member" } as never);
      c.set("user", { id: "user-81" } as never);
      await next();
    })
    .route("/meetings/:id/questions", meetingQuestionsRouter);
}

describe("Meeting Questions routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists only the current user's threads", async () => {
    mocks.listThreads.mockResolvedValue([{ id: "thread-81", title: "项目经验" }]);
    const response = await app().request("/meetings/meeting-81/questions");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ records: [{ id: "thread-81", title: "项目经验" }] });
  });

  it("creates a question thread", async () => {
    mocks.createThread.mockResolvedValue({ id: "thread-81", title: "项目经验" });
    const response = await app().request("/meetings/meeting-81/questions", {
      body: JSON.stringify({ title: "项目经验" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(201);
  });

  it("accepts an idempotent question into its reserved exchange", async () => {
    mocks.ask.mockResolvedValue({ id: "exchange-81", status: "pending" });
    const response = await app().request("/meetings/meeting-81/questions/thread-81/messages", {
      body: JSON.stringify({
        question: "谁负责支付迁移？",
        requestId: "00000000-0000-4000-8000-000000000081",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ id: "exchange-81", status: "pending" });
  });

  it("returns a stable conflict for a reused request id with different content", async () => {
    mocks.ask.mockResolvedValue("conflict");
    const response = await app().request("/meetings/meeting-81/questions/thread-81/messages", {
      body: JSON.stringify({
        question: "另一个问题",
        requestId: "00000000-0000-4000-8000-000000000081",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(409);
  });

  it("returns a retry window when the server-side question limit is reached", async () => {
    mocks.ask.mockResolvedValue("rate-limited");
    const response = await app().request("/meetings/meeting-81/questions/thread-81/messages", {
      body: JSON.stringify({
        question: "谁负责支付迁移？",
        requestId: "00000000-0000-4000-8000-000000000082",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });

  it("rejects an oversized thread body from Content-Length before validation", async () => {
    const body = JSON.stringify({ title: "x".repeat(MEETING_ANSWER_REQUEST_BODY_MAX_BYTES) });
    const response = await app().request("/meetings/meeting-81/questions", {
      body,
      headers: {
        "Content-Length": String(new TextEncoder().encode(body).byteLength),
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    expect(response.status).toBe(413);
    expect(mocks.createThread).not.toHaveBeenCalled();
  });

  it("rejects an oversized streamed question body without Content-Length", async () => {
    const encoded = new TextEncoder().encode(
      JSON.stringify({
        question: "x".repeat(MEETING_ANSWER_REQUEST_BODY_MAX_BYTES),
        requestId: "00000000-0000-4000-8000-000000000083",
      }),
    );
    const request = new Request(
      "http://localhost/meetings/meeting-81/questions/thread-81/messages",
      {
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            const midpoint = Math.floor(encoded.byteLength / 2);
            controller.enqueue(encoded.slice(0, midpoint));
            controller.enqueue(encoded.slice(midpoint));
            controller.close();
          },
        }),
        duplex: "half",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      } as RequestInit & { duplex: "half" },
    );
    expect(request.headers.has("Content-Length")).toBe(false);
    const response = await app().request(request);
    expect(response.status).toBe(413);
    expect(mocks.ask).not.toHaveBeenCalled();
  });
});
