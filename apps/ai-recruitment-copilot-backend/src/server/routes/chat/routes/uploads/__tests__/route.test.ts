import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { createUploadsRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/chat/routes/uploads/route";

const mocks = {
  buildAttachmentKeyByHash: vi.fn(),
  createAttachment: vi.fn(),
  findAttachmentByContentHash: vi.fn(),
  parseResumeDocument: vi.fn(),
  putObjectBytes: vi.fn(),
  sha256HexOfBytes: vi.fn(),
};

const uploadsRouter = createUploadsRouter({
  buildAttachmentKey: mocks.buildAttachmentKeyByHash,
  createAttachment: mocks.createAttachment,
  findAttachment: mocks.findAttachmentByContentHash,
  parseDocument: mocks.parseResumeDocument,
  putObject: mocks.putObjectBytes,
  sha256: mocks.sha256HexOfBytes,
});

const HASH = "b".repeat(64);
const ORG_ID = "org_uploads_route";
const SLUG = "test-org";
const STORAGE_KEY = "dev/chat-attachments/fresh.jpeg";
const USER_ID = "user_uploads_route";

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("user", { id: USER_ID } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("activeOrg", { id: ORG_ID, slug: SLUG } as never);
      await next();
    })
    .route("/uploads", uploadsRouter);
}

describe("uploadsRouter cache policy", () => {
  const originalDisableCache = process.env.RESUME_PARSE_DISABLE_CACHE;
  const originalProvider = process.env.RESUME_PARSE_PROVIDER;

  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }
    if (originalDisableCache === undefined) {
      delete process.env.RESUME_PARSE_DISABLE_CACHE;
    } else {
      process.env.RESUME_PARSE_DISABLE_CACHE = originalDisableCache;
    }
    if (originalProvider === undefined) {
      delete process.env.RESUME_PARSE_PROVIDER;
    } else {
      process.env.RESUME_PARSE_PROVIDER = originalProvider;
    }
    mocks.sha256HexOfBytes.mockResolvedValue(HASH);
    mocks.buildAttachmentKeyByHash.mockResolvedValue(STORAGE_KEY);
    mocks.putObjectBytes.mockImplementation(() => Promise.resolve());
    mocks.parseResumeDocument.mockResolvedValue({
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

  it("does not reuse a cache entry produced by a different parser provider", async () => {
    process.env.RESUME_PARSE_PROVIDER = "aliyun-docmining";
    mocks.findAttachmentByContentHash.mockResolvedValue({
      parsedStatus: "ready",
      parsedTextSource: "qwen-ocr",
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
    expect(mocks.parseResumeDocument).toHaveBeenCalledTimes(1);
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

  it("stores structured output immediately when Aliyun document mining is selected", async () => {
    process.env.RESUME_PARSE_DISABLE_CACHE = "true";
    process.env.RESUME_PARSE_PROVIDER = "aliyun-docmining";
    const structured = { name: "候选人", skills: ["TypeScript"] };
    mocks.parseResumeDocument.mockResolvedValue({
      pageCount: 2,
      structured,
      text: JSON.stringify(structured),
      textSource: "aliyun-docmining",
    });

    const form = new FormData();
    form.set(
      "file",
      new File([new TextEncoder().encode("document-bytes")], "resume.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );

    const res = await makeApp().request("/uploads", {
      body: form,
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(mocks.parseResumeDocument).toHaveBeenCalledTimes(1);
    expect(mocks.createAttachment.mock.calls[0]?.[0]).toMatchObject({
      parsedStatus: "ready",
      parsedStructured: structured,
      parsedTextSource: "aliyun-docmining",
    });
    await expect(res.json()).resolves.toMatchObject({
      parseStatus: "ready",
      parsed: {
        structured,
        textSource: "aliyun-docmining",
      },
    });
  });
});
