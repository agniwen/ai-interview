import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentDebugRouter } from "../route";

const mocks = vi.hoisted(() => ({
  parseResumeFastToProfile: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/middlewares/permission", () => ({
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent", () => ({
  parseResumeFastToProfile: mocks.parseResumeFastToProfile,
}));

function createApp(role: string) {
  return factory
    .createApp()
    .use(async (c, next) => {
      c.set("member", { role } as never);
      await next();
    })
    .route("/", agentDebugRouter);
}

describe("agentDebugRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseResumeFastToProfile.mockResolvedValue({
      parsedPageCount: 2,
      parsedStructured: {
        age: 28,
        name: "张三",
        skills: ["TypeScript"],
      },
      parsedText: "张三\nTypeScript 工程师",
      parsedTextSource: "qwen-ocr",
      resumeProfile: {
        age: 28,
        educationExperiences: [],
        email: null,
        gender: null,
        name: "张三",
        personalStrengths: [],
        phone: null,
        projectExperiences: [],
        schools: [],
        skills: ["TypeScript"],
        targetRoles: ["前端工程师"],
        workExperiences: [],
        workYears: 5,
      },
    });
  });

  it("POST /resume-parser-test rejects non-admin workspace members", async () => {
    const form = new FormData();
    form.append("resume", new File(["resume"], "resume.pdf", { type: "application/pdf" }));

    const res = await createApp("member").request("/resume-parser-test", {
      body: form,
      method: "POST",
    });

    expect(res.status).toBe(403);
    expect(mocks.parseResumeFastToProfile).not.toHaveBeenCalled();
  });

  it("POST /resume-parser-test returns OCR text and structured parser fields for admins", async () => {
    const file = new File(["resume"], "resume.pdf", { type: "application/pdf" });
    const form = new FormData();
    form.append("resume", file);

    const res = await createApp("admin").request("/resume-parser-test", {
      body: form,
      method: "POST",
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fileName).toBe("resume.pdf");
    expect(json.ocr).toEqual({
      pageCount: 2,
      text: "张三\nTypeScript 工程师",
      textSource: "qwen-ocr",
    });
    expect(json.resumeProfile.name).toBe("张三");
    expect(json.parsedStructured.skills).toEqual(["TypeScript"]);
    expect(mocks.parseResumeFastToProfile).toHaveBeenCalledTimes(1);
    expect(mocks.parseResumeFastToProfile.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        name: file.name,
        size: file.size,
        type: file.type,
      }),
    );
  });
});
