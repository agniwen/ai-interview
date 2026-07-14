import { RequestContext } from "@mastra/core/request-context";
import { zValidator } from "@hono/zod-validator";
import { MAX_RESUME_FILE_SIZE_BYTES } from "@arc/shared/bulk-resume-upload";
import { isSupportedResumeDocumentInput } from "@arc/shared/resume-documents";
import { parseResumeFastToProfile } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import { mastra } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/index";
import { toMastraRequestContext } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/request-context";
import { getWorkspaceRequestContext } from "@arc/ai-recruitment-copilot-backend/server/context/workspace-request-context";
import { createInternalErrorResponse } from "@arc/ai-recruitment-copilot-backend/server/error-handler";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import {
  agentDebugAgentRunSchema,
  agentDebugResourceParamsSchema,
  agentDebugWorkflowRunSchema,
} from "./schema";

function isWorkspaceAdmin(role: string | null | undefined) {
  return role === "owner" || role === "admin";
}

const requireAgentDebugAdmin = factory.createMiddleware(async (c, next) => {
  if (!isWorkspaceAdmin(c.var.member?.role)) {
    return c.json({ message: "Forbidden" }, 403);
  }
  await next();
});

const DEBUG_SAFE_WORKFLOW_KEYS = new Set([
  "interviewQuestionsWorkflow",
  "interviewReportWorkflow",
  "resumeAnalysisWorkflow",
  "resumeParseWorkflow",
  "resumeReviewWorkflow",
]);

const RESUME_FILE_WORKFLOW_KEYS = new Set(["resumeAnalysisWorkflow", "resumeParseWorkflow"]);

function createDebugRequestContext(c: Parameters<typeof getWorkspaceRequestContext>[0]) {
  const { organization, user } = getWorkspaceRequestContext(c);
  return new RequestContext(
    toMastraRequestContext({
      extra: { feature: "agent-debug" },
      userId: user.id,
      workspaceId: organization.id,
      workspaceSlug: organization.slug,
    }),
  );
}

function stringifyJsonSafe(value: unknown): string {
  return (
    JSON.stringify(value, (key, item) => {
      if (key === "bytesBase64") {
        return "[redacted]";
      }
      if (item instanceof Error) {
        return { message: item.message, name: item.name };
      }
      if (typeof item === "bigint") {
        return item.toString();
      }
      if (item instanceof Uint8Array) {
        return `[Uint8Array ${item.byteLength} bytes]`;
      }
      return item;
    }) ?? "null"
  );
}

function listDebugSafeWorkflows() {
  return Object.entries(mastra.listWorkflows()).filter(([key]) =>
    DEBUG_SAFE_WORKFLOW_KEYS.has(key),
  );
}

export const agentDebugRouter = factory
  .createApp()
  .use("*", requirePermission("globalConfig", "read"), requireAgentDebugAdmin)
  .get("/resources", (c) => {
    const agents = Object.entries(mastra.listAgents()).map(([key, agent]) => ({
      description: agent.getDescription(),
      id: agent.id,
      key,
      name: agent.name,
    }));
    const workflows = listDebugSafeWorkflows().map(([key, workflow]) => ({
      description: workflow.description ?? "",
      id: workflow.id,
      inputKind: RESUME_FILE_WORKFLOW_KEYS.has(key) ? "resume-file" : "json",
      inputSchema: workflow.inputSchema["~standard"].jsonSchema.input({
        target: "draft-2020-12",
      }),
      key,
      steps: Object.keys(workflow.steps),
    }));

    return c.json({ agents, workflows }, 200);
  })
  .post(
    "/agents/:key/run",
    zValidator("param", agentDebugResourceParamsSchema, jsonValidatorError("资源标识无效。")),
    zValidator("json", agentDebugAgentRunSchema, jsonValidatorError("调试参数无效。")),
    async (c) => {
      const { key } = c.req.valid("param");
      const agent = Object.entries(mastra.listAgents()).find(([name]) => name === key)?.[1];
      if (!agent) {
        return c.json({ error: "Agent 不存在。" }, 404);
      }

      const startedAt = performance.now();
      try {
        const output = await agent.generate(c.req.valid("json").prompt, {
          requestContext: createDebugRequestContext(c),
        });
        const usage = output.totalUsage ?? output.usage;
        return c.json(
          {
            detailsJson: stringifyJsonSafe({
              toolCalls: output.toolCalls,
              toolResults: output.toolResults,
            }),
            durationMs: Math.round(performance.now() - startedAt),
            finishReason: output.finishReason,
            runId: output.runId,
            text: output.text,
            traceId: output.traceId,
            usage: {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              totalTokens: usage.totalTokens,
            },
          },
          200,
        );
      } catch (error) {
        return c.json(
          {
            ...createInternalErrorResponse({
              error,
              operation: "agent-debug-agent-run",
              publicMessage: "Agent 调试运行失败。",
            }),
            durationMs: Math.round(performance.now() - startedAt),
            stage: "agent-debug.agent-run",
          },
          500,
        );
      }
    },
  )
  .post(
    "/workflows/:key/run-file",
    zValidator("param", agentDebugResourceParamsSchema, jsonValidatorError("资源标识无效。")),
    async (c) => {
      const { key } = c.req.valid("param");
      const workflow = listDebugSafeWorkflows().find(([name]) => name === key)?.[1];
      if (!workflow) {
        return c.json({ error: "Workflow 不存在。" }, 404);
      }
      if (!RESUME_FILE_WORKFLOW_KEYS.has(key)) {
        return c.json({ error: "该 Workflow 不支持文件输入。" }, 400);
      }

      const formData = await c.req.formData();
      const resume = formData.get("resume");
      if (!(resume instanceof File)) {
        return c.json({ error: "缺少简历文件。" }, 400);
      }
      if (resume.size === 0) {
        return c.json({ error: "简历文件不能为空。" }, 400);
      }
      if (resume.size > MAX_RESUME_FILE_SIZE_BYTES) {
        return c.json({ error: "简历文件不能超过 20 MB。" }, 400);
      }
      if (!isSupportedResumeDocumentInput({ fileName: resume.name, mediaType: resume.type })) {
        return c.json({ error: "不支持该简历文件格式。" }, 400);
      }

      const startedAt = performance.now();
      let runId: string | undefined;
      try {
        const input = {
          bytesBase64: Buffer.from(await resume.arrayBuffer()).toString("base64"),
          fileName: resume.name,
          mediaType: resume.type || undefined,
        };
        const validation = await workflow.inputSchema["~standard"].validate(input);
        if (validation.issues) {
          return c.json({ error: "文件无法转换为 Workflow 输入。" }, 400);
        }

        const run = await workflow.createRun();
        ({ runId } = run);
        const output = await run.start({
          inputData: validation.value,
          requestContext: createDebugRequestContext(c),
          tracingOptions: {
            hideInput: true,
            hideOutput: true,
            tags: ["agent-debug", "resume-file"],
          },
        });
        if (output.status === "failed") {
          return c.json(
            {
              ...createInternalErrorResponse({
                error: output.error,
                operation: "agent-debug-workflow-file-run",
                publicMessage: "Workflow 调试运行失败。",
              }),
              durationMs: Math.round(performance.now() - startedAt),
              runId,
              stage: "agent-debug.workflow-file-run",
              status: output.status,
              traceId: output.traceId,
            },
            500,
          );
        }

        let result: unknown = null;
        if (output.status === "success") {
          ({ result } = output);
        } else if (output.status === "suspended") {
          result = output.suspendPayload;
        } else if (output.status === "tripwire") {
          result = output.tripwire;
        }

        return c.json(
          {
            durationMs: Math.round(performance.now() - startedAt),
            resultJson: stringifyJsonSafe(result),
            runId: run.runId,
            status: output.status,
            stepsJson: stringifyJsonSafe(output.steps),
            traceId: output.traceId,
          },
          200,
        );
      } catch (error) {
        return c.json(
          {
            ...createInternalErrorResponse({
              error,
              operation: "agent-debug-workflow-file-run",
              publicMessage: "Workflow 调试运行失败。",
            }),
            durationMs: Math.round(performance.now() - startedAt),
            runId,
            stage: "agent-debug.workflow-file-run",
          },
          500,
        );
      }
    },
  )
  .post(
    "/workflows/:key/run",
    zValidator("param", agentDebugResourceParamsSchema, jsonValidatorError("资源标识无效。")),
    zValidator("json", agentDebugWorkflowRunSchema, jsonValidatorError("调试参数无效。")),
    async (c) => {
      const { key } = c.req.valid("param");
      const workflow = listDebugSafeWorkflows().find(([name]) => name === key)?.[1];
      if (!workflow) {
        return c.json({ error: "Workflow 不存在。" }, 404);
      }

      const startedAt = performance.now();
      let runId: string | undefined;
      try {
        const { input } = c.req.valid("json");
        const validation = await workflow.inputSchema["~standard"].validate(input);
        if (validation.issues) {
          return c.json(
            {
              error: "Workflow 输入不符合 Input Schema。",
              issues: validation.issues.map((issue) => ({
                message: issue.message,
                path: issue.path?.map((segment) =>
                  typeof segment === "object" && "key" in segment
                    ? String(segment.key)
                    : String(segment),
                ),
              })),
            },
            400,
          );
        }

        const run = await workflow.createRun();
        ({ runId } = run);
        const output = await run.start({
          inputData: validation.value,
          requestContext: createDebugRequestContext(c),
        });
        if (output.status === "failed") {
          return c.json(
            {
              ...createInternalErrorResponse({
                error: output.error,
                operation: "agent-debug-workflow-run",
                publicMessage: "Workflow 调试运行失败。",
              }),
              durationMs: Math.round(performance.now() - startedAt),
              runId,
              stage: "agent-debug.workflow-run",
              status: output.status,
              traceId: output.traceId,
            },
            500,
          );
        }

        let result: unknown = null;
        if (output.status === "success") {
          ({ result } = output);
        } else if (output.status === "suspended") {
          result = output.suspendPayload;
        } else if (output.status === "tripwire") {
          result = output.tripwire;
        }

        return c.json(
          {
            durationMs: Math.round(performance.now() - startedAt),
            resultJson: stringifyJsonSafe(result),
            runId: run.runId,
            status: output.status,
            stepsJson: stringifyJsonSafe(output.steps),
            traceId: output.traceId,
          },
          200,
        );
      } catch (error) {
        return c.json(
          {
            ...createInternalErrorResponse({
              error,
              operation: "agent-debug-workflow-run",
              publicMessage: "Workflow 调试运行失败。",
            }),
            durationMs: Math.round(performance.now() - startedAt),
            runId,
            stage: "agent-debug.workflow-run",
          },
          500,
        );
      }
    },
  )
  .post("/resume-parser-test", async (c) => {
    const formData = await c.req.formData();
    const resume = formData.get("resume");
    if (!(resume instanceof File)) {
      return c.json({ error: "缺少简历文件。" }, 400);
    }

    try {
      const parsed = await parseResumeFastToProfile(resume);
      return c.json(
        {
          fileName: resume.name,
          ocr: {
            pageCount: parsed.parsedPageCount,
            text: parsed.parsedText,
            textSource: parsed.parsedTextSource,
          },
          parsedStructured: parsed.parsedStructured,
          resumeProfile: parsed.resumeProfile,
        },
        200,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "简历解析失败。";
      if (message.includes("PDF") || message.includes("MB")) {
        return c.json({ error: message, stage: "agent-debug.resume-parser-test" }, 400);
      }
      return c.json(
        {
          ...createInternalErrorResponse({
            error,
            operation: "agent-debug-resume-parser-test",
            publicMessage: "简历解析失败。",
          }),
          stage: "agent-debug.resume-parser-test",
        },
        500,
      );
    }
  });
