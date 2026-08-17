import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { structuredSchema } from "@arc/db-schema/resume-parser-schema";
import { attachmentTextSourceSchema } from "@arc/db-schema/db-enums";
import { sha256HexOfBytes } from "@arc/shared/file-hash";
import type { AiRunEvent } from "@arc/shared/ai-run-events";
import { emitMastraWorkflowStreamEvents } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/adapters/ai-run-stream";
import {
  generateResumeStructured,
  parseResumeDocument,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline";
import type { ResumeParseProgressEvent } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline";

const resumeParseInputSchema = z.object({
  bytesBase64: z.string().min(1),
  fileName: z.string().trim().min(1),
  mediaType: z.string().trim().optional(),
});

const resumeParseHashOutputSchema = resumeParseInputSchema.extend({
  fileHash: z.string().min(1),
});

const resumeParseTextOutputSchema = resumeParseHashOutputSchema.extend({
  pageCount: z.number().int().min(1),
  text: z.string().min(1),
  textSource: attachmentTextSourceSchema.exclude(["pdf-parse"]),
});

const resumeParseDocumentOutputSchema = resumeParseTextOutputSchema.extend({
  structured: structuredSchema.optional(),
});

const resumeParseStructuredOutputSchema = resumeParseDocumentOutputSchema.extend({
  structured: structuredSchema,
});

const resumeParsePreviewSchema = z.object({
  name: z.string().nullable(),
  schools: z.array(z.string()),
  skills: z.array(z.string()),
  targetRoles: z.array(z.string()),
  workYears: z.number().nullable(),
});

const resumeParseOutputSchema = resumeParseStructuredOutputSchema.extend({
  preview: resumeParsePreviewSchema,
});

export type ResumeParseWorkflowOutput = z.output<typeof resumeParseOutputSchema>;

export type ResumeParseWorkflowProgressEvent =
  | ResumeParseProgressEvent
  | { type: "structure.started" }
  | { preview: z.infer<typeof resumeParsePreviewSchema>; type: "structure.completed" };

export interface RunResumeParseWorkflowOptions {
  dependencies?: ResumeParseWorkflowDeps;
  onProgress?: (event: ResumeParseWorkflowProgressEvent) => void;
}

export interface StreamResumeParseWorkflowOptions extends RunResumeParseWorkflowOptions {
  onWorkflowEvent: (event: AiRunEvent) => void;
  traceId?: string;
}

export interface ResumeParseWorkflowDeps {
  hashBytes: typeof sha256HexOfBytes;
  parseDocument: typeof parseResumeDocument;
  structureText: typeof generateResumeStructured;
}

function bytesFromBase64(value: string): Uint8Array {
  return Buffer.from(value, "base64");
}

function buildResumePreview(structured: z.infer<typeof structuredSchema>) {
  return {
    name: structured.name,
    schools: structured.schools,
    skills: structured.skills.slice(0, 12),
    targetRoles: structured.targetRoles,
    workYears: structured.workYears,
  };
}

function toWorkflowInput(input: { bytes: Uint8Array; fileName: string; mediaType?: string }) {
  return {
    bytesBase64: Buffer.from(input.bytes).toString("base64"),
    fileName: input.fileName,
    mediaType: input.mediaType,
  };
}

export function createResumeParseWorkflow(deps: ResumeParseWorkflowDeps) {
  const hashResumeStep = createStep({
    execute: async ({ inputData }) => ({
      ...inputData,
      fileHash: await deps.hashBytes(bytesFromBase64(inputData.bytesBase64)),
    }),
    id: "hash-resume",
    inputSchema: resumeParseInputSchema,
    outputSchema: resumeParseHashOutputSchema,
  });

  const extractResumeTextStep = createStep({
    execute: async ({ inputData }) => {
      const parsed = await deps.parseDocument({
        bytes: bytesFromBase64(inputData.bytesBase64),
        fileName: inputData.fileName,
        mediaType: inputData.mediaType,
      });
      const output: z.output<typeof resumeParseDocumentOutputSchema> = {
        ...inputData,
        pageCount: parsed.pageCount,
        text: parsed.text,
        textSource: parsed.textSource,
      };
      if ("structured" in parsed) {
        output.structured = parsed.structured;
      }
      return output;
    },
    id: "extract-resume-text",
    inputSchema: resumeParseHashOutputSchema,
    outputSchema: resumeParseDocumentOutputSchema,
  });

  const structureResumeStep = createStep({
    execute: async ({ inputData }) => ({
      ...inputData,
      structured: inputData.structured ?? (await deps.structureText(inputData.text)),
    }),
    id: "structure-resume",
    inputSchema: resumeParseDocumentOutputSchema,
    outputSchema: resumeParseStructuredOutputSchema,
  });

  const composeResumeParseResultStep = createStep({
    // oxlint-disable-next-line require-await -- Mastra step execute functions are typed as async.
    execute: async ({ inputData }) => ({
      ...inputData,
      preview: buildResumePreview(inputData.structured),
    }),
    id: "compose-resume-parse-result",
    inputSchema: resumeParseStructuredOutputSchema,
    outputSchema: resumeParseOutputSchema,
  });

  return (
    createWorkflow({
      description: "Extract resume text, structure the resume, and expose a small preview.",
      id: "resume-parse-workflow",
      inputSchema: resumeParseInputSchema,
      outputSchema: resumeParseOutputSchema,
    })
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflows compose steps with .then().
      .then(hashResumeStep)
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflows compose steps with .then().
      .then(extractResumeTextStep)
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflows compose steps with .then().
      .then(structureResumeStep)
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflows compose steps with .then().
      .then(composeResumeParseResultStep)
      .commit()
  );
}

function createProgressResumeParseWorkflow(
  onProgress: NonNullable<RunResumeParseWorkflowOptions["onProgress"]>,
  dependencies: ResumeParseWorkflowDeps,
) {
  return createResumeParseWorkflow({
    hashBytes: dependencies.hashBytes,
    parseDocument: (documentInput) =>
      dependencies.parseDocument({
        ...documentInput,
        onProgress,
      }),
    structureText: async (text) => {
      onProgress({ type: "structure.started" });
      const structured = await dependencies.structureText(text);
      onProgress({
        preview: buildResumePreview(structured),
        type: "structure.completed",
      });
      return structured;
    },
  });
}

const defaultDependencies: ResumeParseWorkflowDeps = {
  hashBytes: sha256HexOfBytes,
  parseDocument: parseResumeDocument,
  structureText: generateResumeStructured,
};

export const resumeParseWorkflow = createResumeParseWorkflow(defaultDependencies);

function resolveResumeParseWorkflow(options: RunResumeParseWorkflowOptions) {
  const dependencies = options.dependencies ?? defaultDependencies;
  if (options.onProgress) {
    return createProgressResumeParseWorkflow(options.onProgress, dependencies);
  }
  if (options.dependencies) {
    return createResumeParseWorkflow(dependencies);
  }
  return resumeParseWorkflow;
}

export async function runResumeParseWorkflow(
  input: {
    bytes: Uint8Array;
    fileName: string;
    mediaType?: string;
  },
  options: RunResumeParseWorkflowOptions = {},
): Promise<ResumeParseWorkflowOutput> {
  const workflow = resolveResumeParseWorkflow(options);
  const run = await workflow.createRun();
  const result = await run.start({
    inputData: toWorkflowInput(input),
  });

  if (result.status === "success") {
    return resumeParseOutputSchema.parse(result.result);
  }
  if (result.status === "failed") {
    throw result.error;
  }
  throw new Error(`Resume parse workflow ended with status ${result.status}.`);
}

export async function streamResumeParseWorkflow(
  input: {
    bytes: Uint8Array;
    fileName: string;
    mediaType?: string;
  },
  options: StreamResumeParseWorkflowOptions,
): Promise<ResumeParseWorkflowOutput> {
  const workflow = resolveResumeParseWorkflow(options);
  const run = await workflow.createRun();
  const output = run.stream({
    inputData: toWorkflowInput(input),
  });

  await emitMastraWorkflowStreamEvents(output.fullStream, options.onWorkflowEvent, {
    stepLabels: {
      "compose-resume-parse-result": "生成解析摘要",
      "extract-resume-text": "提取简历文本",
      "hash-resume": "计算简历哈希",
      "structure-resume": "提取结构化字段",
    },
    title: "解析简历",
    traceId: options.traceId,
    workflowId: "resume-parse-workflow",
  });

  const result = await output.result;
  if (result.status === "success") {
    return resumeParseOutputSchema.parse(result.result);
  }
  if (result.status === "failed") {
    throw result.error;
  }
  throw new Error(`Resume parse workflow ended with status ${result.status}.`);
}
