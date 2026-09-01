import { rawBackendEnvironment } from "../../../../config/raw-backend-environment.js";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { convert as htmlToText } from "html-to-text";
import mammoth from "mammoth";
import OpenAI from "openai";
import JSZip from "jszip";
import {
  chatAttachment,
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
} from "@arc/db-schema/schema";
import {
  normalizeResumeStructuredSourceFileName,
  resumeParserGenerationSchema,
  structuredSchema,
} from "@arc/db-schema/resume-parser-schema";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { and, eq, sql } from "drizzle-orm";
import type { BackgroundQueueProducerService } from "../../../../background/background-queue-producer.service.js";
import type { WorkloadObjectStorage } from "../../../../infrastructure/object-storage/workload-object-storage.port.js";
import type { Database } from "../../../../infrastructure/database/database.tokens.js";
import type { ResumeParseProcessorPorts } from "../resume.processor.js";
import { projectResumeProfile } from "../../resume-library/resume-profile-projection.js";

const execFileAsync = promisify(execFile);

function modelName(env: NodeJS.ProcessEnv) {
  return (
    env.RESUME_PARSE_MODEL?.trim() ||
    env.MASTRA_STRUCTURED_MODEL?.trim()?.split("/").at(-1) ||
    env.ALIBABA_STRUCTURED_MODEL?.trim()?.split("/").at(-1) ||
    "qwen3.5-plus"
  );
}

async function pdfTextAndImages(bytes: Uint8Array): Promise<{
  images: string[];
  pageCount: number;
  text: string;
}> {
  const mupdf = await import("mupdf");
  const document = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const pageCount = document.countPages();
    const texts: string[] = [];
    const images: string[] = [];
    for (let index = 0; index < Math.min(pageCount, 12); index += 1) {
      const page = document.loadPage(index);
      try {
        const structured = page.toStructuredText();
        try {
          texts.push(structured.asText());
        } finally {
          structured.destroy();
        }
        if ((texts.at(-1)?.trim().length ?? 0) < 200) {
          const pixmap = page.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false);
          try {
            images.push(`data:image/png;base64,${Buffer.from(pixmap.asPNG()).toString("base64")}`);
          } finally {
            pixmap.destroy();
          }
        }
      } finally {
        page.destroy();
      }
    }
    return { images, pageCount, text: texts.join("\n\n").trim() };
  } finally {
    document.destroy();
  }
}

function plainText(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replaceAll("\r\n", "\n").trim();
}

function xmlText(xml: string): string {
  return xml
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll(/\s+/gu, " ")
    .trim();
}

async function extractOfficeOpenXml(
  bytes: Uint8Array,
  kind: "pptx" | "xlsx",
): Promise<ParsedDocument> {
  const zip = await JSZip.loadAsync(bytes);
  const pattern =
    kind === "pptx" ? /^ppt\/slides\/slide\d+\.xml$/u : /^xl\/worksheets\/sheet\d+\.xml$/u;
  const paths = Object.keys(zip.files)
    .filter((path) => pattern.test(path))
    .toSorted();
  const sharedStringsFile = kind === "xlsx" ? zip.file("xl/sharedStrings.xml") : null;
  const sharedStrings = sharedStringsFile ? xmlText(await sharedStringsFile.async("text")) : "";
  const blocks: string[] = [];
  if (sharedStrings) {
    blocks.push(sharedStrings);
  }
  for (const path of paths.slice(0, 20)) {
    const file = zip.file(path);
    if (file) {
      blocks.push(xmlText(await file.async("text")));
    }
  }
  return {
    images: [],
    pageCount: Math.max(paths.length, 1),
    text: blocks.join("\n").trim(),
    textSource: kind === "pptx" ? "pptx-text" : "xlsx-text",
  };
}

async function convertLegacyOffice(input: {
  bytes: Uint8Array;
  extension: "doc" | "ppt" | "xls";
}): Promise<{ bytes: Uint8Array; extension: "docx" | "pptx" | "xlsx" }> {
  const directory = await mkdtemp(join(tmpdir(), "resume-office-"));
  const targetExtension = ({ doc: "docx", ppt: "pptx", xls: "xlsx" } as const)[input.extension];
  const source = join(directory, `source.${input.extension}`);
  try {
    await writeFile(source, input.bytes);
    await execFileAsync(
      rawBackendEnvironment.LIBREOFFICE_BIN || "soffice",
      ["--headless", "--convert-to", targetExtension, "--outdir", directory, source],
      { timeout: 120_000 },
    );
    return {
      bytes: await readFile(join(directory, `source.${targetExtension}`)),
      extension: targetExtension,
    };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

interface ParsedDocument {
  images: string[];
  pageCount: number;
  text: string;
  textSource: "docx-text" | "html-text" | "pptx-text" | "qwen3.5-ocr" | "xlsx-text";
}

async function extractDocument(input: {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
}): Promise<ParsedDocument> {
  const extension = input.fileName.toLowerCase().split(".").at(-1) || "";
  if (extension === "pdf" || input.contentType === "application/pdf") {
    const pdf = await pdfTextAndImages(input.bytes);
    return {
      ...pdf,
      textSource: "qwen3.5-ocr",
    };
  }
  if (extension === "docx") {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(input.bytes) });
    return { images: [], pageCount: 1, text: result.value.trim(), textSource: "docx-text" };
  }
  if (extension === "pptx" || extension === "xlsx") {
    return extractOfficeOpenXml(input.bytes, extension);
  }
  if (extension === "doc" || extension === "ppt" || extension === "xls") {
    const converted = await convertLegacyOffice({ bytes: input.bytes, extension });
    return extractDocument({
      bytes: converted.bytes,
      contentType: "application/octet-stream",
      fileName: `converted.${converted.extension}`,
    });
  }
  if (["html", "htm"].includes(extension) || input.contentType === "text/html") {
    return {
      images: [],
      pageCount: 1,
      text: htmlToText(plainText(input.bytes), { wordwrap: false }).trim(),
      textSource: "html-text",
    };
  }
  if (
    ["png", "jpg", "jpeg", "webp"].includes(extension) ||
    input.contentType.startsWith("image/")
  ) {
    const mime = input.contentType.startsWith("image/") ? input.contentType : "image/png";
    return {
      images: [`data:${mime};base64,${Buffer.from(input.bytes).toString("base64")}`],
      pageCount: 1,
      text: "",
      textSource: "qwen3.5-ocr",
    };
  }
  if (
    ["txt", "md", "csv", "json", "rtf"].includes(extension) ||
    input.contentType.startsWith("text/")
  ) {
    return { images: [], pageCount: 1, text: plainText(input.bytes), textSource: "html-text" };
  }
  throw new Error(`不支持的简历文件格式：${extension || input.contentType}`);
}

interface Claimed {
  batch: typeof resumeUploadBatch.$inferSelect;
  item: typeof resumeUploadBatchItem.$inferSelect;
}

export class ResumeParseInfrastructure implements ResumeParseProcessorPorts {
  private readonly client: OpenAI;
  private readonly database: Database;
  private readonly env: NodeJS.ProcessEnv;
  private readonly queueProducer: BackgroundQueueProducerService;
  private readonly storage: WorkloadObjectStorage;

  constructor(
    database: Database,
    storage: WorkloadObjectStorage,
    queueProducer: BackgroundQueueProducerService,
    env: NodeJS.ProcessEnv = rawBackendEnvironment,
  ) {
    this.database = database;
    this.storage = storage;
    this.env = env;
    this.queueProducer = queueProducer;
    this.client = new OpenAI({
      apiKey: env.ALIBABA_API_KEY?.trim() || "missing",
      baseURL: env.ALIBABA_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
  }

  async runBulkUploadWorkflow(input: {
    bypassCache: boolean | undefined;
    itemId: string;
    retryParseFailure: boolean;
  }): Promise<void> {
    const claimed = await this.claim(input.itemId);
    if (!claimed) {
      return;
    }
    try {
      const parsed = await this.parse(claimed.item, Boolean(input.bypassCache));
      const target = await this.persistParsed(claimed, parsed.profile, parsed.text);
      await this.enqueueEnrichment(claimed, target);
      await this.finish(claimed, target);
    } catch (error) {
      await this.fail(
        claimed,
        error instanceof Error ? error.message : String(error),
        input.retryParseFailure,
      );
      if (input.retryParseFailure) {
        throw error;
      }
    }
  }

  private claim(itemId: string): Promise<Claimed | null> {
    return this.database.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(resumeUploadBatchItem)
        .where(
          and(eq(resumeUploadBatchItem.id, itemId), eq(resumeUploadBatchItem.status, "pending")),
        )
        .for("update", { skipLocked: true })
        .limit(1);
      if (!item) {
        return null;
      }
      const [batch] = await tx
        .select()
        .from(resumeUploadBatch)
        .where(eq(resumeUploadBatch.id, item.batchId))
        .for("update")
        .limit(1);
      if (!batch || ["cancelled", "completed"].includes(batch.status)) {
        return null;
      }
      const now = new Date();
      await tx
        .update(resumeUploadBatchItem)
        .set({
          attemptCount: item.attemptCount + 1,
          errorMessage: null,
          startedAt: now,
          status: "processing",
        })
        .where(eq(resumeUploadBatchItem.id, item.id));
      await tx
        .update(resumeUploadBatch)
        .set({ status: "running", updatedAt: now })
        .where(eq(resumeUploadBatch.id, batch.id));
      if (item.resumeRecordId) {
        await tx
          .update(studioInterview)
          .set({ resumeParseError: null, resumeParseStatus: "processing", updatedAt: now })
          .where(eq(studioInterview.id, item.resumeRecordId));
      }
      if (item.poolItemId) {
        await tx
          .update(resumePoolItem)
          .set({ resumeParseError: null, resumeParseStatus: "processing", updatedAt: now })
          .where(eq(resumePoolItem.id, item.poolItemId));
      }
      return {
        batch: { ...batch, status: "running" },
        item: { ...item, attemptCount: item.attemptCount + 1, status: "processing" },
      };
    });
  }

  private async parse(item: Claimed["item"], bypassCache: boolean) {
    if (!bypassCache && item.contentHash) {
      const cached = await this.database.query.chatAttachment.findFirst({
        where: { contentHash: item.contentHash, parsedStatus: "ready" },
      });
      const structured = structuredSchema.safeParse(cached?.parsedStructured);
      if (structured.success && structured.data.scoringFacts) {
        return { profile: projectResumeProfile(structured.data), text: cached?.parsedText ?? "" };
      }
    }
    const object = await this.storage.getObjectBytes(item.storageKey);
    if (!object) {
      throw new Error("简历文件不可用（S3 对象缺失）。");
    }
    const document = await extractDocument({ ...object, fileName: item.originalFileName });
    if (!document.text && document.images.length === 0) {
      throw new Error("简历未提取到可读内容。");
    }
    if (!this.env.ALIBABA_API_KEY?.trim()) {
      throw new Error("ALIBABA_API_KEY is required for resume parsing");
    }
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      {
        text: `从简历提取结构化事实，严格输出 JSON。未知字段使用 null 或空数组，不得臆测。sourceFileName 不要输出。简历文本：\n${document.text.slice(0, 80_000)}`,
        type: "text",
      },
      ...document.images.slice(0, 12).map((url) => ({
        image_url: { url },
        type: "image_url" as const,
      })),
    ];
    const response = await this.client.chat.completions.create({
      messages: [
        { content: "你是简历事实抽取器。返回完整 JSON，不要代码围栏。", role: "system" },
        { content, role: "user" },
      ],
      model: modelName(this.env),
      response_format: { type: "json_object" },
      temperature: 0,
    });
    const raw = response.choices[0]?.message.content;
    if (!raw) {
      throw new Error("Resume parser provider returned empty output");
    }
    const generated = resumeParserGenerationSchema.parse(JSON.parse(raw));
    const structured = structuredSchema.parse({
      ...generated,
      sourceFileName: normalizeResumeStructuredSourceFileName(item.originalFileName),
    });
    if (item.contentHash) {
      await this.database
        .update(chatAttachment)
        .set({
          parsedAt: new Date(),
          parsedError: null,
          parsedPageCount: document.pageCount,
          parsedStatus: "ready",
          parsedStructured: structured,
          parsedText: document.text,
          parsedTextSource: document.textSource,
        })
        .where(eq(chatAttachment.contentHash, item.contentHash));
    }
    return { profile: projectResumeProfile(structured), text: document.text };
  }

  private persistParsed(claimed: Claimed, profile: ResumeProfile, text: string) {
    return this.database.transaction(async (tx) => {
      const [current] = await tx
        .select({ status: resumeUploadBatchItem.status })
        .from(resumeUploadBatchItem)
        .where(eq(resumeUploadBatchItem.id, claimed.item.id))
        .for("update")
        .limit(1);
      const [batch] = await tx
        .select({ status: resumeUploadBatch.status })
        .from(resumeUploadBatch)
        .where(eq(resumeUploadBatch.id, claimed.batch.id))
        .for("share")
        .limit(1);
      if (current?.status !== "processing" || batch?.status === "cancelled") {
        throw new Error("简历批次已取消或任务已被替代。");
      }
      const now = new Date();
      if (claimed.batch.target === "resume_pool") {
        const id = claimed.item.poolItemId ?? randomUUID();
        await tx
          .insert(resumePoolItem)
          .values({
            candidateEmail: profile.email,
            candidateName: profile.name || claimed.item.originalFileName,
            candidatePhone: profile.phone,
            createdBy: claimed.batch.createdBy,
            id,
            jobDescriptionId:
              claimed.batch.jdMode === "bind" ? claimed.batch.jobDescriptionId : null,
            organizationId: claimed.batch.organizationId,
            resumeContentHash: claimed.item.contentHash,
            resumeFileName: claimed.item.originalFileName,
            resumeParseError: null,
            resumeParseStatus: "processing",
            resumeParsedAt: now,
            resumeProfile: profile,
            resumeStorageKey: claimed.item.storageKey,
            resumeText: text,
            scope: claimed.batch.resumePoolScope ?? "private",
            targetRole: profile.targetRoles[0] ?? null,
          })
          .onConflictDoUpdate({
            set: {
              candidateEmail: profile.email,
              candidateName: profile.name || claimed.item.originalFileName,
              candidatePhone: profile.phone,
              resumeContentHash: claimed.item.contentHash,
              resumeFileName: claimed.item.originalFileName,
              resumeParseError: null,
              resumeParseStatus: "processing",
              resumeParsedAt: now,
              resumeProfile: profile,
              resumeStorageKey: claimed.item.storageKey,
              resumeText: text,
              targetRole: profile.targetRoles[0] ?? null,
              updatedAt: now,
            },
            target: resumePoolItem.id,
          });
        await tx
          .update(resumeUploadBatchItem)
          .set({ poolItemId: id })
          .where(eq(resumeUploadBatchItem.id, claimed.item.id));
        return { id, type: "resume_pool_item" as const };
      }
      const id = claimed.item.resumeRecordId ?? randomUUID();
      await tx
        .insert(studioInterview)
        .values({
          candidateEmail: profile.email,
          candidateName: profile.name || claimed.item.originalFileName,
          candidatePhone: profile.phone,
          createdBy: claimed.batch.createdBy,
          id,
          jobDescriptionId: claimed.batch.jdMode === "bind" ? claimed.batch.jobDescriptionId : null,
          organizationId: claimed.batch.organizationId,
          resumeContentHash: claimed.item.contentHash,
          resumeFileName: claimed.item.originalFileName,
          resumeParseError: null,
          resumeParseStatus: "processing",
          resumeParsedAt: now,
          resumeProfile: profile,
          resumeSourceType: "direct_upload",
          resumeStorageKey: claimed.item.storageKey,
          resumeText: text,
          targetRole: profile.targetRoles[0] ?? null,
        })
        .onConflictDoUpdate({
          set: {
            candidateEmail: profile.email,
            candidateName: profile.name || claimed.item.originalFileName,
            candidatePhone: profile.phone,
            jobDescriptionId:
              claimed.batch.jdMode === "bind" ? claimed.batch.jobDescriptionId : null,
            resumeContentHash: claimed.item.contentHash,
            resumeFileName: claimed.item.originalFileName,
            resumeParseError: null,
            resumeParseStatus: "processing",
            resumeParsedAt: now,
            resumeProfile: profile,
            resumeStorageKey: claimed.item.storageKey,
            resumeText: text,
            targetRole: profile.targetRoles[0] ?? null,
            updatedAt: now,
          },
          target: studioInterview.id,
        });
      await tx
        .update(resumeUploadBatchItem)
        .set({ resumeRecordId: id })
        .where(eq(resumeUploadBatchItem.id, claimed.item.id));
      return { id, type: "studio_interview" as const };
    });
  }

  private async enqueueEnrichment(
    claimed: Claimed,
    target: { id: string; type: "resume_pool_item" | "studio_interview" },
  ) {
    const jobDescriptionId =
      claimed.batch.jdMode === "bind" ? claimed.batch.jobDescriptionId : null;
    if (target.type === "studio_interview") {
      const runId = randomUUID();
      const now = new Date();
      await this.database
        .update(studioInterview)
        .set({
          resumeEvaluationAttemptMode: "qualitative",
          resumeParseError: null,
          resumeParseStatus: "ready",
          resumeReviewQueuedAt: now,
          resumeReviewRunId: runId,
          resumeReviewStatus: "queued",
          updatedAt: now,
        })
        .where(
          and(
            eq(studioInterview.id, target.id),
            eq(studioInterview.resumeParseStatus, "processing"),
          ),
        );
      await this.queueProducer.enqueueResumeReviewGenerationJobs([
        {
          autoMatchJobDescription: claimed.batch.jdMode === "auto",
          generationToken: claimed.item.id,
          jobDescriptionId,
          organizationId: claimed.batch.organizationId,
          resumeRecordId: target.id,
          runId,
          source: "resume_upload",
        },
        {
          organizationId: claimed.batch.organizationId,
          resumeRecordId: target.id,
          source: "resume_pool_import_questions",
        },
      ]);
    } else {
      await this.database
        .update(resumePoolItem)
        .set({ resumeParseError: null, resumeParseStatus: "ready", updatedAt: new Date() })
        .where(
          and(eq(resumePoolItem.id, target.id), eq(resumePoolItem.resumeParseStatus, "processing")),
        );
      await this.queueProducer.enqueueResumeReviewGenerationJobs([
        {
          autoMatchJobDescription: claimed.batch.jdMode === "auto",
          generationToken: claimed.item.id,
          jobDescriptionId,
          organizationId: claimed.batch.organizationId,
          poolItemId: target.id,
          source: "resume_pool_upload",
        },
      ]);
    }
    await this.queueProducer.enqueueResumeSemanticIndexJobs([
      {
        organizationId: claimed.batch.organizationId,
        sourceId: target.id,
        sourceType: target.type,
      },
    ]);
  }

  private async finish(
    claimed: Claimed,
    target: { id: string; type: "resume_pool_item" | "studio_interview" },
  ) {
    await this.database.transaction(async (tx) => {
      const now = new Date();
      await (target.type === "studio_interview"
        ? tx
            .update(studioInterview)
            .set({ resumeParseError: null, resumeParseStatus: "ready", updatedAt: now })
            .where(eq(studioInterview.id, target.id))
        : tx
            .update(resumePoolItem)
            .set({ resumeParseError: null, resumeParseStatus: "ready", updatedAt: now })
            .where(eq(resumePoolItem.id, target.id)));
      await tx
        .update(resumeUploadBatchItem)
        .set({ errorMessage: null, finishedAt: now, status: "succeeded" })
        .where(
          and(
            eq(resumeUploadBatchItem.id, claimed.item.id),
            eq(resumeUploadBatchItem.status, "processing"),
          ),
        );
      await ResumeParseInfrastructure.reconcile(tx, claimed.batch.id);
    });
  }

  private async fail(claimed: Claimed, errorMessage: string, retrying: boolean) {
    await this.database.transaction(async (tx) => {
      const now = new Date();
      const status = retrying ? ("pending" as const) : ("failed" as const);
      await tx
        .update(resumeUploadBatchItem)
        .set({
          errorMessage: retrying ? null : errorMessage.slice(0, 1000),
          finishedAt: retrying ? null : now,
          startedAt: retrying ? null : claimed.item.startedAt,
          status,
        })
        .where(
          and(
            eq(resumeUploadBatchItem.id, claimed.item.id),
            eq(resumeUploadBatchItem.status, "processing"),
          ),
        );
      if (claimed.item.resumeRecordId) {
        await tx
          .update(studioInterview)
          .set({
            resumeParseError: retrying ? null : errorMessage.slice(0, 1000),
            resumeParseStatus: retrying ? "queued" : "failed",
            updatedAt: now,
          })
          .where(eq(studioInterview.id, claimed.item.resumeRecordId));
      }
      if (claimed.item.poolItemId) {
        await tx
          .update(resumePoolItem)
          .set({
            resumeParseError: retrying ? null : errorMessage.slice(0, 1000),
            resumeParseStatus: retrying ? "queued" : "failed",
            updatedAt: now,
          })
          .where(eq(resumePoolItem.id, claimed.item.poolItemId));
      }
      if (!retrying) {
        await ResumeParseInfrastructure.reconcile(tx, claimed.batch.id);
      }
    });
  }

  private static async reconcile(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    batchId: string,
  ) {
    const counts = await tx
      .select({ count: sql<number>`count(*)::int`, status: resumeUploadBatchItem.status })
      .from(resumeUploadBatchItem)
      .where(eq(resumeUploadBatchItem.batchId, batchId))
      .groupBy(resumeUploadBatchItem.status);
    const byStatus = new Map(counts.map((row) => [row.status, row.count]));
    const succeededCount = byStatus.get("succeeded") ?? 0;
    const failedCount = byStatus.get("failed") ?? 0;
    const skippedCount = byStatus.get("duplicate_skipped") ?? 0;
    const processedCount = succeededCount + failedCount + skippedCount;
    const [batch] = await tx
      .select()
      .from(resumeUploadBatch)
      .where(eq(resumeUploadBatch.id, batchId))
      .limit(1);
    if (!batch) {
      return;
    }
    const complete = batch.status !== "cancelled" && processedCount === batch.totalCount;
    const now = new Date();
    await tx
      .update(resumeUploadBatch)
      .set({
        completedAt: complete ? now : batch.completedAt,
        failedCount,
        processedCount,
        skippedCount,
        status: complete ? "completed" : batch.status,
        succeededCount,
        updatedAt: now,
      })
      .where(eq(resumeUploadBatch.id, batchId));
  }
}
