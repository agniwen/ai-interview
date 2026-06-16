import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

const mocks = vi.hoisted(() => ({
  buildAttachmentKeyByHash: vi.fn(),
  createAttachment: vi.fn(),
  extractResumeDocumentText: vi.fn(),
  findAttachmentByContentHash: vi.fn(),
  putObjectBytes: vi.fn(),
  sha256HexOfBytes: vi.fn(),
}));

vi.mock("@arc/shared/file-hash", () => ({ sha256HexOfBytes: mocks.sha256HexOfBytes }));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  buildAttachmentKeyByHash: mocks.buildAttachmentKeyByHash,
  putObjectBytes: mocks.putObjectBytes,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline", () => ({
  extractResumeDocumentText: mocks.extractResumeDocumentText,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments", () => ({
  createAttachment: mocks.createAttachment,
  findAttachmentByContentHash: mocks.findAttachmentByContentHash,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting.
import { uploadsRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/chat/routes/uploads/route";

const HASH = "b".repeat(64);
const ORG_ID = "org_uploads_route";
const SLUG = "test-org";
const STORAGE_KEY = "dev/chat-attachments/fresh.jpeg";
const USER_ID = "user_uploads_route";

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("user", { id: USER_ID } as never);
      c.set("activeOrg", { id: ORG_ID, slug: SLUG } as never);
      await next();
    })
    .route("/uploads", uploadsRouter);
}

describe("uploadsRouter cache policy", () => {
  const originalDisableCache = process.env.RESUME_PARSE_DISABLE_CACHE;

  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }
    if (originalDisableCache === undefined) {
      delete process.env.RESUME_PARSE_DISABLE_CACHE;
    } else {
      process.env.RESUME_PARSE_DISABLE_CACHE = originalDisableCache;
    }
    mocks.sha256HexOfBytes.mockResolvedValue(HASH);
    mocks.buildAttachmentKeyByHash.mockResolvedValue(STORAGE_KEY);
    mocks.putObjectBytes.mockImplementation(async () => {});
    mocks.extractResumeDocumentText.mockResolvedValue({
      pageCount: 1,
      text: "fresh ocr text",
      textSource: "qwen-ocr",
    });
  });

  it("cache disabled: preflight does not read the content-hash registry", async () => {
    process.env.RESUME_PARSE_DISABLE_CACHE = "true";
    mocks.findAttachmentByContentHash.mockResolvedValue({
      parsedStatus: "ready",
      storageKey: "dev/chat-attachments/cached.jpeg",
    });

    const res = await makeApp().request("/uploads/preflight", {
      body: JSON.stringify({
        filename: "resume.jpeg",
        hash: HASH,
        mediaType: "image/jpeg",
        size: 1024,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ hit: false });
    expect(mocks.findAttachmentByContentHash).not.toHaveBeenCalled();
    expect(mocks.createAttachment).not.toHaveBeenCalled();
  });

  it("cache disabled: upload parses fresh instead of copying a cached attachment row", async () => {
    process.env.RESUME_PARSE_DISABLE_CACHE = "true";
    mocks.findAttachmentByContentHash.mockResolvedValue({
      parsedStatus: "ready",
      parsedText: "cached text",
      storageKey: "dev/chat-attachments/cached.jpeg",
    });

    const form = new FormData();
    form.set(
      "file",
      new File([new TextEncoder().encode("image-bytes")], "resume.jpeg", {
        type: "image/jpeg",
      }),
    );

    const res = await makeApp().request("/uploads", {
      body: form,
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(mocks.findAttachmentByContentHash).not.toHaveBeenCalled();
    expect(mocks.putObjectBytes).toHaveBeenCalledTimes(1);
    expect(mocks.extractResumeDocumentText).toHaveBeenCalledTimes(1);
    expect(mocks.createAttachment).toHaveBeenCalledTimes(1);
    expect(mocks.createAttachment.mock.calls[0]?.[0]).toMatchObject({
      contentHash: HASH,
      organizationId: ORG_ID,
      parsedStatus: "ready",
      parsedText: "fresh ocr text",
      storageKey: STORAGE_KEY,
      userId: USER_ID,
    });
  });
});
