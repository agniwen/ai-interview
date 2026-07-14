import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { agentDebugRouter } from "../route";

const mocks = vi.hoisted(() => ({
  agentGenerate: vi.fn(),
  fileWorkflowStart: vi.fn(),
  parseResumeFastToProfile: vi.fn(),
  workflowStart: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/middlewares/permission", () => ({
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent", () => ({
  parseResumeFastToProfile: mocks.parseResumeFastToProfile,
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/mastra/index", () => ({
  mastra: {
    listAgents: () => ({
      resumeStructuredAgent: {
        generate: mocks.agentGenerate,
        getDescription: () => "把简历原文抽取为结构化档案",
        id: "resume-structured-agent",
        name: "ResumeStructuredAgent",
      },
    }),
    listWorkflows: () => ({
      bulkResumeUploadWorkflow: {
        createRun: vi.fn(),
        description: "批量处理入库任务",
        id: "bulk-resume-upload-workflow",
        inputSchema: z.object({ itemId: z.string() }),
        steps: { process: { id: "process" } },
      },
      resumeParseWorkflow: {
        createRun: vi.fn(() =>
          Promise.resolve({
            runId: "resume-parse-run-1",
            start: mocks.fileWorkflowStart,
          }),
        ),
        description: "运行简历文件解析",
        id: "resume-parse-workflow",
        inputSchema: z.object({
          bytesBase64: z.string(),
          fileName: z.string(),
          mediaType: z.string().optional(),
        }),
        steps: {
          parse: { id: "parse" },
        },
      },
      resumeReviewWorkflow: {
        createRun: vi.fn(() =>
          Promise.resolve({
            runId: "workflow-run-1",
            start: mocks.workflowStart,
          }),
        ),
        description: "运行简历评价",
        id: "resume-review-workflow",
        inputSchema: z.object({ resumeId: z.string() }),
        steps: {
          score: { id: "score" },
        },
      },
    }),
  },
}));

function createApp(role: string) {
  return factory
    .createApp()
    .use(async (c, next) => {
      c.set("activeOrg", { id: "workspace-1", slug: "default" } as never);
      c.set("member", { role } as never);
      c.set("user", { id: "user-1" } as never);
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
    mocks.agentGenerate.mockResolvedValue({
      finishReason: "stop",
      runId: "agent-run-1",
      text: "已完成结构化抽取",
      toolCalls: [],
      toolResults: [],
      totalUsage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
      traceId: "trace-1",
      usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
    });
    mocks.workflowStart.mockResolvedValue({
      input: { resumeId: "resume-1" },
      result: { score: 88 },
      status: "success",
      steps: { score: { output: { score: 88 }, status: "success" } },
      traceId: "workflow-trace-1",
    });
    mocks.fileWorkflowStart.mockResolvedValue({
      input: { fileName: "resume.pdf" },
      result: { bytesBase64: "must-not-leak", structured: { name: "张三" } },
      status: "success",
      steps: {
        parse: {
          output: { bytesBase64: "must-not-leak", name: "张三" },
          status: "success",
        },
      },
      traceId: "resume-parse-trace-1",
    });
  });

  it("GET /resources lists registered agents and workflows for admins", async () => {
    const res = await createApp("admin").request("/resources");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      agents: [
        {
          description: "把简历原文抽取为结构化档案",
          id: "resume-structured-agent",
          key: "resumeStructuredAgent",
          name: "ResumeStructuredAgent",
        },
      ],
      workflows: [
        {
          description: "运行简历文件解析",
          id: "resume-parse-workflow",
          inputKind: "resume-file",
          inputSchema: expect.objectContaining({
            properties: expect.objectContaining({ fileName: expect.any(Object) }),
            type: "object",
          }),
          key: "resumeParseWorkflow",
          steps: ["parse"],
        },
        {
          description: "运行简历评价",
          id: "resume-review-workflow",
          inputKind: "json",
          inputSchema: expect.objectContaining({
            properties: expect.objectContaining({ resumeId: expect.any(Object) }),
            type: "object",
          }),
          key: "resumeReviewWorkflow",
          steps: ["score"],
        },
      ],
    });
  });

  it("does not expose or execute workflows with database side effects", async () => {
    const resources = await createApp("admin").request("/resources");
    const run = await createApp("admin").request("/workflows/bulkResumeUploadWorkflow/run", {
      body: JSON.stringify({ input: { itemId: "another-workspace-item" } }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const resourcesJson = await resources.json();
    expect(resourcesJson.workflows).toHaveLength(2);
    expect(run.status).toBe(404);
    expect(mocks.workflowStart).not.toHaveBeenCalled();
  });

  it("POST /agents/:key/run executes a registered agent with workspace context", async () => {
    const res = await createApp("admin").request("/agents/resumeStructuredAgent/run", {
      body: JSON.stringify({ prompt: "提取这份简历" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(
      expect.objectContaining({
        finishReason: "stop",
        runId: "agent-run-1",
        text: "已完成结构化抽取",
        traceId: "trace-1",
        usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
      }),
    );
    const options = mocks.agentGenerate.mock.calls[0]?.[1];
    expect(mocks.agentGenerate).toHaveBeenCalledWith("提取这份简历", expect.any(Object));
    expect(Object.fromEntries(options.requestContext.entries())).toEqual({
      feature: "agent-debug",
      userId: "user-1",
      workspaceId: "workspace-1",
      workspaceSlug: "default",
    });
  });

  it("POST /workflows/:key/run validates and executes workflow JSON", async () => {
    const res = await createApp("owner").request("/workflows/resumeReviewWorkflow/run", {
      body: JSON.stringify({ input: { resumeId: "resume-1" } }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(
      expect.objectContaining({
        resultJson: JSON.stringify({ score: 88 }),
        runId: "workflow-run-1",
        status: "success",
        stepsJson: JSON.stringify({ score: { output: { score: 88 }, status: "success" } }),
        traceId: "workflow-trace-1",
      }),
    );
    expect(mocks.workflowStart).toHaveBeenCalledWith(
      expect.objectContaining({ inputData: { resumeId: "resume-1" } }),
    );
  });

  it("POST /workflows/:key/run returns schema issues before creating a run", async () => {
    const res = await createApp("admin").request("/workflows/resumeReviewWorkflow/run", {
      body: JSON.stringify({ input: { resumeId: 42 } }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(
      expect.objectContaining({
        error: "Workflow 输入不符合 Input Schema。",
        issues: expect.any(Array),
      }),
    );
    expect(mocks.workflowStart).not.toHaveBeenCalled();
  });

  it("POST /workflows/:key/run-file executes a file workflow with protected tracing", async () => {
    const form = new FormData();
    form.append("resume", new File(["resume"], "resume.pdf", { type: "application/pdf" }));

    const res = await createApp("admin").request("/workflows/resumeParseWorkflow/run-file", {
      body: form,
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(
      expect.objectContaining({
        resultJson: JSON.stringify({ bytesBase64: "[redacted]", structured: { name: "张三" } }),
        runId: "resume-parse-run-1",
        status: "success",
        stepsJson: JSON.stringify({
          parse: {
            output: { bytesBase64: "[redacted]", name: "张三" },
            status: "success",
          },
        }),
        traceId: "resume-parse-trace-1",
      }),
    );
    expect(mocks.fileWorkflowStart).toHaveBeenCalledWith(
      expect.objectContaining({
        inputData: {
          bytesBase64: Buffer.from("resume").toString("base64"),
          fileName: "resume.pdf",
          mediaType: "application/pdf",
        },
        tracingOptions: expect.objectContaining({ hideInput: true }),
      }),
    );
    const options = mocks.fileWorkflowStart.mock.calls[0]?.[0];
    expect(Object.fromEntries(options.requestContext.entries())).toEqual({
      feature: "agent-debug",
      userId: "user-1",
      workspaceId: "workspace-1",
      workspaceSlug: "default",
    });
  });

  it("POST /workflows/:key/run-file rejects JSON workflows", async () => {
    const form = new FormData();
    form.append("resume", new File(["resume"], "resume.pdf", { type: "application/pdf" }));

    const res = await createApp("admin").request("/workflows/resumeReviewWorkflow/run-file", {
      body: form,
      method: "POST",
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "该 Workflow 不支持文件输入。" });
    expect(mocks.fileWorkflowStart).not.toHaveBeenCalled();
  });

  it("POST /workflows/:key/run-file validates the resume file", async () => {
    const form = new FormData();
    form.append("resume", new File(["resume"], "resume.txt", { type: "text/plain" }));

    const res = await createApp("admin").request("/workflows/resumeParseWorkflow/run-file", {
      body: form,
      method: "POST",
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "不支持该简历文件格式。" });
    expect(mocks.fileWorkflowStart).not.toHaveBeenCalled();
  });

  it("does not expose registered resources to non-admin members", async () => {
    const resources = await createApp("member").request("/resources");
    const run = await createApp("member").request("/agents/resumeStructuredAgent/run", {
      body: JSON.stringify({ prompt: "test" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(resources.status).toBe(403);
    expect(run.status).toBe(403);
    expect(mocks.agentGenerate).not.toHaveBeenCalled();
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

  it("POST /resume-parser-test hides unexpected parser failures", async () => {
    const parserError = new Error("postgres://user:secret@private-host/database");
    mocks.parseResumeFastToProfile.mockRejectedValueOnce(parserError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const form = new FormData();
    form.append("resume", new File(["resume"], "resume.pdf", { type: "application/pdf" }));

    const res = await createApp("admin").request("/resume-parser-test", {
      body: form,
      method: "POST",
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "简历解析失败。",
      stage: "agent-debug.resume-parser-test",
    });
    expect(consoleError).toHaveBeenCalledWith("[agent-debug-resume-parser-test] failed", {
      error: parserError,
    });
  });
});
