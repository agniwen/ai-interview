import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

const mocks = vi.hoisted(() => ({
  generateResumeStructured: vi.fn(),
  getObjectBytes: vi.fn(),
  getObjectStream: vi.fn(),
  getUserAttachment: vi.fn(),
  listAllJobDescriptions: vi.fn(),
  listRecruitingJobDescriptions: vi.fn(),
  parseResumeFast: vi.fn(),
  presignGetObjectUrl: vi.fn(),
  projectAttachmentToResumeProfile: vi.fn(),
  resolveJobDescriptionMatchBestEffort: vi.fn(),
  updateParseResultByHash: vi.fn(),
  updateStructuredByHash: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  getObjectBytes: mocks.getObjectBytes,
  getObjectStream: mocks.getObjectStream,
  presignGetObjectUrl: mocks.presignGetObjectUrl,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline", () => ({
  generateResumeStructured: mocks.generateResumeStructured,
  parseResumeFast: mocks.parseResumeFast,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/resume-parser-agent", () => ({
  projectAttachmentToResumeProfile: mocks.projectAttachmentToResumeProfile,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments", () => ({
  getUserAttachment: mocks.getUserAttachment,
  updateParseResultByHash: mocks.updateParseResultByHash,
  updateStructuredByHash: mocks.updateStructuredByHash,
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao",
  () => ({
    listAllJobDescriptions: mocks.listAllJobDescriptions,
    listRecruitingJobDescriptions: mocks.listRecruitingJobDescriptions,
  }),
);
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/interview/match-job-description",
  () => ({
    resolveJobDescriptionMatchBestEffort: mocks.resolveJobDescriptionMatchBestEffort,
  }),
);

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting.
import { attachmentsRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/chat/routes/attachments/route";

const ORG_ID = "org_attachments_route";
const USER_ID = "user_attachments_route";

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("user", { id: USER_ID } as never);
      c.set("activeOrg", { id: ORG_ID } as never);
      await next();
    })
    .route("/attachments", attachmentsRouter);
}

describe("attachmentsRouter match-job-description", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }
    mocks.listAllJobDescriptions.mockResolvedValue([{ id: "jd-1", name: "前端工程师" }]);
    mocks.listRecruitingJobDescriptions.mockResolvedValue([{ id: "jd-1", name: "前端工程师" }]);
    mocks.resolveJobDescriptionMatchBestEffort.mockResolvedValue({
      matchedId: "jd-1",
      reason: "技能匹配",
    });
  });

  it("matches from parsedStructured without regenerating structured resume data", async () => {
    const profile = { name: "林雪莹", targetRoles: ["前端工程师"] };
    mocks.getUserAttachment.mockResolvedValue({
      contentHash: "a".repeat(64),
      id: "att-1",
      parsedStructured: { name: "林雪莹" },
      parsedText: "ocr text",
    });
    mocks.projectAttachmentToResumeProfile.mockReturnValue(profile);

    const res = await makeApp().request("/attachments/att-1/match-job-description", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ matchedId: "jd-1", reason: "技能匹配" });
    expect(mocks.generateResumeStructured).not.toHaveBeenCalled();
    expect(mocks.resolveJobDescriptionMatchBestEffort).toHaveBeenCalledWith({
      jobDescriptions: [{ id: "jd-1", name: "前端工程师" }],
      resumeProfile: profile,
    });
  });

  it("generates structured resume data from cached OCR text and backfills by content hash", async () => {
    const structured = { name: "林雪莹", skills: ["React"] };
    const profile = { name: "林雪莹", skills: ["React"], targetRoles: ["前端工程师"] };
    mocks.getUserAttachment.mockResolvedValue({
      contentHash: "b".repeat(64),
      id: "att-2",
      parsedStructured: null,
      parsedText: "cached ocr text",
    });
    mocks.generateResumeStructured.mockResolvedValue(structured);
    mocks.projectAttachmentToResumeProfile.mockReturnValue(profile);

    const res = await makeApp().request("/attachments/att-2/match-job-description", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(mocks.generateResumeStructured).toHaveBeenCalledWith("cached ocr text");
    expect(mocks.updateStructuredByHash).toHaveBeenCalledWith("b".repeat(64), structured);
    expect(mocks.resolveJobDescriptionMatchBestEffort).toHaveBeenCalledWith({
      jobDescriptions: [{ id: "jd-1", name: "前端工程师" }],
      resumeProfile: profile,
    });
  });

  it("passes a signed PDF URL when an attachment must be parsed again", async () => {
    const structured = { name: "林雪莹", skills: ["React"] };
    const profile = { name: "林雪莹", skills: ["React"], targetRoles: ["前端工程师"] };
    mocks.getUserAttachment.mockResolvedValue({
      contentHash: "c".repeat(64),
      filename: "resume.pdf",
      id: "att-3",
      mediaType: "application/pdf",
      parsedStructured: null,
      parsedText: null,
      storageKey: "org/resume.pdf",
    });
    mocks.getObjectBytes.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
    });
    mocks.presignGetObjectUrl.mockResolvedValue(
      "https://storage.example.test/resume.pdf?signature=secret",
    );
    mocks.parseResumeFast.mockResolvedValue({
      pageCount: 2,
      structured,
      text: "完整 PDF 文本",
      textSource: "qwen3.5-ocr",
    });
    mocks.projectAttachmentToResumeProfile.mockReturnValue(profile);

    const res = await makeApp().request("/attachments/att-3/match-job-description", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(mocks.presignGetObjectUrl).toHaveBeenCalledWith("org/resume.pdf");
    expect(mocks.parseResumeFast).toHaveBeenCalledWith({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "resume.pdf",
      fileUrl: "https://storage.example.test/resume.pdf?signature=secret",
      mediaType: "application/pdf",
    });
  });
});
