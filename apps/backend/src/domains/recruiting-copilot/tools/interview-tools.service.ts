import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { chatAttachment, jobDescription, studioInterview } from "@arc/db-schema/schema";
import {
  getResumeDocumentExtension,
  isSupportedResumeDocumentInput,
} from "@arc/shared/resume-documents";
import { isResumeStructuredSourceFileNameCompatible } from "@arc/db-schema/resume-parser-schema";
import { sha256HexOfBytes } from "@arc/shared/file-hash";
import { WORKSPACE_DATABASE_PORT } from "../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";
import {
  CANDIDATE_DOCUMENT_COMMANDS,
  projectResumeProfile,
} from "../../candidate-lifecycle/public.js";
import type { CandidateDocumentCommands } from "../../candidate-lifecycle/public.js";
import { ChatStorage } from "../chat/chat-storage.js";
import type { z } from "zod";
import type {
  interviewQuestionInputSchema,
  jobMatchInputSchema,
  resumeReviewInputSchema,
} from "./interview-tools.schemas.js";
import {
  createAiRunEventStream,
  generateResumeStructured,
  matchJobDescription,
  parseResume,
  streamQuestions,
  streamReview,
} from "./resume-analysis.js";

export interface InterviewToolsUploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

type MatchInput = z.infer<typeof jobMatchInputSchema>;
type QuestionInput = z.infer<typeof interviewQuestionInputSchema>;
type ReviewInput = z.infer<typeof resumeReviewInputSchema>;

@Injectable()
export class InterviewToolsService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(CANDIDATE_DOCUMENT_COMMANDS)
    private readonly candidateDocuments: CandidateDocumentCommands,
    @Inject(ChatStorage) private readonly storage: ChatStorage,
  ) {}

  parseResume(
    organizationId: string,
    userId: string,
    file: InterviewToolsUploadedFile | undefined,
  ) {
    if (!file) {
      throw new BadRequestException("缺少简历文件。", {
        errorCode: "INTERVIEW_RESUME_FILE_REQUIRED",
      });
    }
    if (file.size <= 0 || file.size > 20 * 1024 * 1024) {
      throw new BadRequestException("简历文件不能超过 20 MB。", {
        errorCode: "INTERVIEW_RESUME_FILE_INVALID",
      });
    }
    if (
      !isSupportedResumeDocumentInput({ fileName: file.originalname, mediaType: file.mimetype })
    ) {
      throw new BadRequestException("不支持的简历文件格式。", {
        errorCode: "INTERVIEW_RESUME_FILE_TYPE_UNSUPPORTED",
      });
    }
    return createAiRunEventStream({
      run: async (emit, runId) => {
        emit({ label: "解析简历", runId, stepId: "parse-resume", type: "step.started" });
        const bytes = new Uint8Array(file.buffer);
        const contentHash = await sha256HexOfBytes(bytes);
        const cached = await this.loadCachedParse(contentHash);
        if (
          cached?.parsedStructured &&
          isResumeStructuredSourceFileNameCompatible(cached.parsedStructured, file.originalname)
        ) {
          const resumeProfile = projectResumeProfile(cached.parsedStructured);
          const output = {
            fileName: file.originalname,
            resumeProfile,
            resumeText: cached.parsedText,
          };
          emit({
            label: "命中已有简历缓存，跳过解析。",
            runId,
            stepId: "parse-resume-cache",
            type: "step.progress",
          });
          emit({ output, runId, stepId: "parse-resume", type: "step.completed" });
          return output;
        }
        if (cached?.parsedText?.trim() && cached.parsedTextSource && cached.parsedPageCount) {
          const structured = await generateResumeStructured(
            {
              images: [],
              pageCount: cached.parsedPageCount,
              text: cached.parsedText,
              textSource: cached.parsedTextSource,
            },
            file.originalname,
          );
          await this.candidateDocuments.storeStructuredParseByHash({
            contentHash,
            filename: file.originalname.slice(0, 255),
            parsedStructured: structured,
          });
          const output = {
            fileName: file.originalname,
            resumeProfile: projectResumeProfile(structured),
            resumeText: cached.parsedText,
          };
          emit({ output, runId, stepId: "parse-resume", type: "step.completed" });
          return output;
        }
        const parsed = await parseResume({
          bytes,
          fileName: file.originalname,
          mediaType: file.mimetype,
        });
        emit({
          artifactType: "resume.profile.preview",
          data: parsed.resumeProfile,
          runId,
          stepId: "parse-resume",
          type: "step.preview",
        });
        await this.persistParseBestEffort({
          bytes,
          file,
          organizationId,
          parsed,
          userId,
        });
        const output = {
          fileName: file.originalname,
          resumeProfile: parsed.resumeProfile,
          resumeText: parsed.text,
        };
        emit({ output, runId, stepId: "parse-resume", type: "step.completed" });
        return output;
      },
      title: "解析简历",
      workflowId: "resume-parse-workflow",
    });
  }

  async matchJobDescription(organizationId: string, input: MatchInput) {
    if (input.interviewRecordId) {
      const [record] = await this.database
        .select({ id: studioInterview.id })
        .from(studioInterview)
        .where(
          and(
            eq(studioInterview.id, input.interviewRecordId),
            eq(studioInterview.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!record) {
        throw new NotFoundException("Interview record not found", {
          errorCode: "INTERVIEW_RECORD_NOT_FOUND",
        });
      }
    }
    const jobs = await this.database
      .select({ id: jobDescription.id, name: jobDescription.name, prompt: jobDescription.prompt })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.organizationId, organizationId),
          eq(jobDescription.lifecycleStatus, "published"),
        ),
      );
    return matchJobDescription(input.resumeProfile, jobs);
  }

  async generateQuestions(organizationId: string, input: QuestionInput) {
    const job = await this.loadJob(organizationId, input.jobDescriptionId);
    return streamQuestions(input.resumeProfile, job);
  }

  async generateReview(organizationId: string, input: ReviewInput, markdownFirst: boolean) {
    const job = await this.loadJob(organizationId, input.jobDescriptionId);
    const text = job ? [`岗位名称：${job.name}`, `岗位 JD：\n${job.prompt}`].join("\n\n") : null;
    return streamReview({
      jobDescription: text,
      markdownFirst,
      resumeProfile: input.resumeProfile,
    });
  }

  private async loadJob(organizationId: string, id?: string | null) {
    if (!id) {
      return null;
    }
    const [job] = await this.database
      .select({ id: jobDescription.id, name: jobDescription.name, prompt: jobDescription.prompt })
      .from(jobDescription)
      .where(and(eq(jobDescription.id, id), eq(jobDescription.organizationId, organizationId)))
      .limit(1);
    return job ?? null;
  }

  private async loadCachedParse(contentHash: string) {
    const [cached] = await this.database
      .select({
        parsedPageCount: chatAttachment.parsedPageCount,
        parsedStructured: chatAttachment.parsedStructured,
        parsedText: chatAttachment.parsedText,
        parsedTextSource: chatAttachment.parsedTextSource,
      })
      .from(chatAttachment)
      .where(
        and(eq(chatAttachment.contentHash, contentHash), eq(chatAttachment.parsedStatus, "ready")),
      )
      .orderBy(desc(chatAttachment.parsedAt))
      .limit(1);
    return cached ?? null;
  }

  private async persistParseBestEffort(input: {
    bytes: Uint8Array;
    file: InterviewToolsUploadedFile;
    organizationId: string;
    parsed: Awaited<ReturnType<typeof parseResume>>;
    userId: string;
  }) {
    try {
      const contentHash = await sha256HexOfBytes(input.bytes);
      const storageKey = this.storage.attachmentKey(
        contentHash,
        getResumeDocumentExtension({
          fileName: input.file.originalname,
          mediaType: input.file.mimetype,
        }),
      );
      await this.storage.put(
        storageKey,
        input.bytes,
        input.file.mimetype || "application/octet-stream",
      );
      await this.candidateDocuments.create({
        contentHash,
        filename: input.file.originalname.slice(0, 255) || "resume",
        id: crypto.randomUUID(),
        mediaType: input.file.mimetype || "application/octet-stream",
        organizationId: input.organizationId,
        parsedAt: new Date(),
        parsedPageCount: input.parsed.pageCount,
        parsedStatus: "ready",
        parsedStructured: input.parsed.structured,
        parsedText: input.parsed.text,
        parsedTextSource: input.parsed.textSource,
        size: input.bytes.byteLength,
        storageKey,
        userId: input.userId,
      });
    } catch (error) {
      console.error("[parse-resume] failed to populate chat_attachment cache", error);
    }
  }
}
