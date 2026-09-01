/* oxlint-disable max-lines, complexity, require-await, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-runtime-typeof -- Review generation, immutable JD snapshots, and guarded publication are one durable workflow. */
import { rawBackendEnvironment } from "../config/raw-backend-environment.js";
import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import {
  jobDescription,
  jobDescriptionVersion,
  resumeEvaluationFailure,
  resumeEvaluationVersion,
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
} from "@arc/db-schema/schema";
import type { JsonValue } from "@arc/db-schema/json";
import { z } from "zod";
import {
  QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION,
  QUALITATIVE_RESUME_EVALUATION_SCHEMA_VERSION,
  qualitativeResumeEvaluationV2Schema,
} from "@arc/db-schema/qualitative-resume-evaluation";
import { generatedInterviewQuestionsSchema } from "@arc/db-schema/interview/types";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type {
  ResumeReviewGenerationJobContext,
  ResumeReviewGenerationJobData,
} from "@arc/resume-parse-queue/resume-review-generation";
import { and, desc, eq, isNull, max, sql } from "drizzle-orm";
import type { Database } from "../infrastructure/database/database.tokens.js";

function modelName(env: NodeJS.ProcessEnv) {
  return (
    env.RESUME_REVIEW_MODEL?.trim() ||
    env.MASTRA_STRUCTURED_MODEL?.trim()?.split("/").at(-1) ||
    env.ALIBABA_STRUCTURED_MODEL?.trim()?.split("/").at(-1) ||
    "deepseek-v4-flash-0731"
  );
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function computeResumeEvaluationInputHash(input: {
  resumeContentHash: string | null;
  resumeProfile: ResumeProfile;
  resumeText: string | null;
}) {
  const { email: _email, name: _name, phone: _phone, ...contentProfile } = input.resumeProfile;
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonical({
          resumeContentHash: input.resumeContentHash,
          resumeProfile: contentProfile,
          resumeText: input.resumeText,
        }),
      ),
    )
    .digest("hex");
}

function evaluationPrompt(input: {
  evaluationAsOf: string;
  jobDescriptionName: string;
  jobDescriptionPrompt: string;
  resumeProfile: ResumeProfile;
  resumeText: string | null;
}) {
  return `你正在执行候选人简历的六维定性评价。只可使用岗位 JD 快照和简历事实，不得使用旧评分配置、权重或外部资料。

评价日期：${input.evaluationAsOf}
岗位名称：${input.jobDescriptionName}
岗位 JD 快照：\n${input.jobDescriptionPrompt}
结构化简历：\n${JSON.stringify(input.resumeProfile)}
简历原文：\n${input.resumeText ?? "未提供"}

严格返回 JSON。recommendationLevel 以及六个 dimensions.*.level 只能是 not_recommended、undecided、recommended、highly_recommended。六维必须为 skillMatch、experienceRelevance、projectMatch、educationBackground、potential、stability；每维包含 basis(job/general/both)、level、evaluation。证据缺失用 undecided；not_recommended 必须有 JD 核心要求和简历事实的直接冲突。conciseOverall 为 1–2 句；detailedOverall 包含 judgment、matchingEvidence、risks。禁止数值分、权重、门槛和推测。seniorityRecommendation、teamPositioning 无充分证据时返回 null。schemaVersion 返回 ${QUALITATIVE_RESUME_EVALUATION_SCHEMA_VERSION}。`;
}

interface JobSnapshot {
  id: string;
  jobDescriptionId: string;
  jobDescriptionName: string;
  prompt: string;
}

export class ResumeReviewInfrastructure {
  private readonly client: OpenAI;
  private readonly database: Database;
  private readonly env: NodeJS.ProcessEnv;

  constructor(database: Database, env: NodeJS.ProcessEnv = rawBackendEnvironment) {
    this.database = database;
    this.env = env;
    this.client = new OpenAI({
      apiKey: env.ALIBABA_API_KEY?.trim() || "missing",
      baseURL: env.ALIBABA_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
  }

  async process(
    input: ResumeReviewGenerationJobData,
    context: ResumeReviewGenerationJobContext,
  ): Promise<void> {
    if (input.source === "resume_pool_import_questions") {
      await this.generateQuestions(input);
      return;
    }
    if (input.source === "resume_pool_upload") {
      await this.reviewPoolItem(input);
      return;
    }
    await this.reviewRecord(input, context);
  }

  private assertProvider(): void {
    if (!this.env.ALIBABA_API_KEY?.trim()) {
      throw new Error("ALIBABA_API_KEY is required for resume review generation");
    }
  }

  private async ensureSnapshot(
    organizationId: string,
    jobDescriptionId: string,
  ): Promise<JobSnapshot | null> {
    return this.database.transaction(async (tx) => {
      const [job] = await tx
        .select({
          id: jobDescription.id,
          lifecycleStatus: jobDescription.lifecycleStatus,
          name: jobDescription.name,
          prompt: jobDescription.prompt,
        })
        .from(jobDescription)
        .where(
          and(
            eq(jobDescription.id, jobDescriptionId),
            eq(jobDescription.organizationId, organizationId),
          ),
        )
        .for("update")
        .limit(1);
      if (!job || job.lifecycleStatus !== "published") {
        return null;
      }
      const [latest] = await tx
        .select()
        .from(jobDescriptionVersion)
        .where(
          and(
            eq(jobDescriptionVersion.jobDescriptionId, job.id),
            eq(jobDescriptionVersion.organizationId, organizationId),
          ),
        )
        .orderBy(desc(jobDescriptionVersion.version))
        .limit(1);
      if (latest?.jobDescriptionName === job.name && latest.prompt === job.prompt) {
        return { ...latest, jobDescriptionId: job.id };
      }
      const [version] = await tx
        .select({ value: max(jobDescriptionVersion.version) })
        .from(jobDescriptionVersion)
        .where(eq(jobDescriptionVersion.jobDescriptionId, job.id));
      const created: JobSnapshot = {
        id: randomUUID(),
        jobDescriptionId: job.id,
        jobDescriptionName: job.name,
        prompt: job.prompt,
      };
      await tx.insert(jobDescriptionVersion).values({
        ...created,
        organizationId,
        version: Number(version?.value ?? 0) + 1,
      });
      return created;
    });
  }

  private async generateEvaluation(input: {
    evaluationAsOf: string;
    jobDescriptionName: string;
    jobDescriptionPrompt: string;
    resumeProfile: ResumeProfile;
    resumeText: string | null;
  }) {
    this.assertProvider();
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.client.chat.completions.create({
          max_tokens: 8192,
          messages: [
            { content: "只输出符合要求的 JSON 对象，不要 Markdown 代码围栏。", role: "system" },
            { content: evaluationPrompt(input), role: "user" },
          ],
          model: modelName(this.env),
          response_format: { type: "json_object" },
          temperature: 0,
        });
        const content = response.choices[0]?.message.content;
        if (!content) {
          throw new Error("Resume review provider returned empty output");
        }
        return qualitativeResumeEvaluationV2Schema.parse(JSON.parse(content));
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  private async generateQuestions(input: {
    organizationId: string;
    resumeRecordId: string;
  }): Promise<void> {
    const configured =
      this.env.NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS?.trim().toLowerCase();
    const enabled = configured === undefined || configured === "" || configured !== "false";
    if (!enabled) {
      return;
    }
    const [record] = await this.database
      .select({
        interviewQuestions: studioInterview.interviewQuestions,
        jobName: jobDescription.name,
        jobPrompt: jobDescription.prompt,
        resumeProfile: studioInterview.resumeProfile,
      })
      .from(studioInterview)
      .leftJoin(
        jobDescription,
        and(
          eq(studioInterview.jobDescriptionId, jobDescription.id),
          eq(jobDescription.organizationId, input.organizationId),
        ),
      )
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!record?.resumeProfile || record.interviewQuestions.length > 0) {
      return;
    }
    this.assertProvider();
    const response = await this.client.chat.completions.create({
      messages: [
        {
          content:
            "基于候选人简历和岗位生成恰好10道由浅入深的中文面试题。严格返回 {interviewQuestions:[...]} JSON。每题含 question、difficulty(easy/medium/hard)、dimension、evaluationFocus、followUpDirections。",
          role: "system",
        },
        {
          content: JSON.stringify({
            job: record.jobName ? { name: record.jobName, prompt: record.jobPrompt } : null,
            resumeProfile: record.resumeProfile,
          }),
          role: "user",
        },
      ],
      model: modelName(this.env),
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    const parsed = generatedInterviewQuestionsSchema.parse(
      JSON.parse(response.choices[0]?.message.content || "{}"),
    );
    const questions = parsed.interviewQuestions.map((question, order) => ({
      ...question,
      order: order + 1,
    }));
    await this.database
      .update(studioInterview)
      .set({ interviewQuestions: questions, updatedAt: new Date() })
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
          sql`${studioInterview.interviewQuestions} = '[]'::jsonb`,
        ),
      );
  }

  private async resolvePoolJob(input: {
    autoMatchJobDescription?: boolean;
    generationToken?: string;
    jobDescriptionId: string | null;
    organizationId: string;
    poolItemId: string;
    resumeProfile: ResumeProfile;
  }): Promise<string | null> {
    if (input.jobDescriptionId) {
      return input.jobDescriptionId;
    }
    if (input.generationToken) {
      const [batch] = await this.database
        .select({ jobDescriptionId: resumeUploadBatch.jobDescriptionId })
        .from(resumeUploadBatchItem)
        .innerJoin(resumeUploadBatch, eq(resumeUploadBatch.id, resumeUploadBatchItem.batchId))
        .where(
          and(
            eq(resumeUploadBatchItem.id, input.generationToken),
            eq(resumeUploadBatch.organizationId, input.organizationId),
          ),
        )
        .limit(1);
      if (batch?.jobDescriptionId) {
        return batch.jobDescriptionId;
      }
    }
    if (!input.autoMatchJobDescription) {
      return null;
    }
    const jobs = await this.database
      .select({ id: jobDescription.id, name: jobDescription.name, prompt: jobDescription.prompt })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.organizationId, input.organizationId),
          eq(jobDescription.lifecycleStatus, "published"),
        ),
      );
    if (jobs.length === 0) {
      return null;
    }
    this.assertProvider();
    const response = await this.client.chat.completions.create({
      messages: [
        {
          content: "选择最匹配岗位；无法可靠匹配则 id 为 null。严格输出 {id:string|null}。",
          role: "system",
        },
        { content: JSON.stringify({ jobs, resumeProfile: input.resumeProfile }), role: "user" },
      ],
      model: modelName(this.env),
      response_format: { type: "json_object" },
      temperature: 0,
    });
    const selected = z
      .object({ id: z.string().nullable().optional() })
      .parse(JSON.parse(response.choices[0]?.message.content || "{}"));
    return selected.id && jobs.some((job) => job.id === selected.id) ? selected.id : null;
  }

  private async reviewPoolItem(
    input: Extract<ResumeReviewGenerationJobData, { source: "resume_pool_upload" }>,
  ): Promise<void> {
    const [record] = await this.database
      .select()
      .from(resumePoolItem)
      .where(
        and(
          eq(resumePoolItem.id, input.poolItemId),
          eq(resumePoolItem.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!record?.resumeProfile || record.resumeParseStatus !== "ready") {
      return;
    }
    const resolvedJobId = await this.resolvePoolJob({
      ...input,
      jobDescriptionId: record.jobDescriptionId,
      resumeProfile: record.resumeProfile,
    });
    if (!resolvedJobId || (input.jobDescriptionId && input.jobDescriptionId !== resolvedJobId)) {
      return;
    }
    if (!record.jobDescriptionId) {
      const [updated] = await this.database
        .update(resumePoolItem)
        .set({ jobDescriptionId: resolvedJobId, updatedAt: new Date() })
        .where(
          and(
            eq(resumePoolItem.id, input.poolItemId),
            eq(resumePoolItem.organizationId, input.organizationId),
            isNull(resumePoolItem.jobDescriptionId),
          ),
        )
        .returning({ id: resumePoolItem.id });
      if (!updated) {
        return;
      }
    }
    const snapshot = await this.ensureSnapshot(input.organizationId, resolvedJobId);
    if (!snapshot) {
      return;
    }
    const inputHash = computeResumeEvaluationInputHash({
      resumeContentHash: record.resumeContentHash,
      resumeProfile: record.resumeProfile,
      resumeText: record.resumeText,
    });
    if (
      record.resumeEvaluationContractVersion === QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION &&
      record.qualitativeJobDescriptionVersionId === snapshot.id &&
      record.resumeEvaluationInputHash === inputHash &&
      qualitativeResumeEvaluationV2Schema.safeParse(record.qualitativeResumeEvaluation).success &&
      !input.force
    ) {
      return;
    }
    const now = new Date();
    const evaluation = await this.generateEvaluation({
      evaluationAsOf: now.toISOString().slice(0, 10),
      jobDescriptionName: snapshot.jobDescriptionName,
      jobDescriptionPrompt: snapshot.prompt,
      resumeProfile: record.resumeProfile,
      resumeText: record.resumeText,
    });
    await this.database
      .update(resumePoolItem)
      .set({
        qualitativeJobDescriptionVersionId: snapshot.id,
        qualitativeRecommendationLevel: evaluation.recommendationLevel,
        qualitativeResumeEvaluation: evaluation,
        qualitativeResumeSummary: evaluation.conciseOverall,
        resumeEvaluationContractVersion: QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION,
        resumeEvaluationGeneratedAt: now,
        resumeEvaluationInputHash: inputHash,
        updatedAt: now,
      })
      .where(
        and(
          eq(resumePoolItem.id, input.poolItemId),
          eq(resumePoolItem.organizationId, input.organizationId),
          eq(resumePoolItem.jobDescriptionId, resolvedJobId),
          record.resumeContentHash
            ? eq(resumePoolItem.resumeContentHash, record.resumeContentHash)
            : isNull(resumePoolItem.resumeContentHash),
        ),
      );
  }

  private async reviewRecord(
    input: Extract<
      ResumeReviewGenerationJobData,
      { source: "reassess" | "resume_pool_import" | "resume_upload" }
    >,
    context: ResumeReviewGenerationJobContext,
  ): Promise<void> {
    const [record] = await this.database
      .select()
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!record || record.resumeReviewRunId !== input.runId) {
      return;
    }
    if (!record.resumeProfile || record.resumeParseStatus !== "ready") {
      await this.failRecord(input, "简历解析完成后才能评估。", context.hasAttemptsRemaining);
      if (context.hasAttemptsRemaining) {
        throw new Error("简历解析完成后才能评估。");
      }
      return;
    }
    let jobId = record.jobDescriptionId;
    if (!jobId && input.source === "resume_upload" && input.autoMatchJobDescription) {
      jobId = await this.resolvePoolJob({
        autoMatchJobDescription: true,
        generationToken: input.generationToken,
        jobDescriptionId: null,
        organizationId: input.organizationId,
        poolItemId: input.poolItemId ?? input.resumeRecordId,
        resumeProfile: record.resumeProfile,
      });
      if (jobId) {
        const [updated] = await this.database
          .update(studioInterview)
          .set({ jobDescriptionId: jobId, updatedAt: new Date() })
          .where(
            and(
              eq(studioInterview.id, input.resumeRecordId),
              eq(studioInterview.organizationId, input.organizationId),
              isNull(studioInterview.jobDescriptionId),
              eq(studioInterview.resumeReviewRunId, input.runId),
            ),
          )
          .returning({ id: studioInterview.id });
        if (!updated) {
          return;
        }
      }
    }
    if (!jobId || (input.jobDescriptionId !== null && input.jobDescriptionId !== jobId)) {
      return;
    }
    const snapshot = await this.ensureSnapshot(input.organizationId, jobId);
    if (!snapshot) {
      const error = new Error("绑定岗位不存在或尚未发布。");
      await this.failRecord(input, error.message, context.hasAttemptsRemaining);
      throw error;
    }
    if (
      record.resumeEvaluationArtifactMode === "qualitative" &&
      qualitativeResumeEvaluationV2Schema.safeParse(record.qualitativeResumeEvaluation).success &&
      !input.force &&
      input.source !== "reassess"
    ) {
      await this.database
        .update(studioInterview)
        .set({
          resumeReviewError: null,
          resumeReviewGeneratedAt: new Date(),
          resumeReviewRunId: null,
          resumeReviewStatus: "ready",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(studioInterview.id, input.resumeRecordId),
            eq(studioInterview.organizationId, input.organizationId),
            eq(studioInterview.resumeReviewRunId, input.runId),
          ),
        );
      return;
    }
    const [claimed] = await this.database
      .update(studioInterview)
      .set({
        qualitativeAttemptJobDescriptionVersionId: snapshot.id,
        resumeEvaluationAttemptMode: "qualitative",
        resumeReviewError: null,
        resumeReviewStatus: "processing",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
          eq(studioInterview.jobDescriptionId, jobId),
          eq(studioInterview.resumeReviewRunId, input.runId),
        ),
      )
      .returning({ id: studioInterview.id });
    if (!claimed) {
      return;
    }
    try {
      const now = new Date();
      const evaluation = await this.generateEvaluation({
        evaluationAsOf: (record.resumeReviewQueuedAt ?? now).toISOString().slice(0, 10),
        jobDescriptionName: snapshot.jobDescriptionName,
        jobDescriptionPrompt: snapshot.prompt,
        resumeProfile: record.resumeProfile,
        resumeText: record.resumeText,
      });
      await this.database.transaction(async (tx) => {
        const [current] = await tx
          .select({
            attemptVersion: studioInterview.qualitativeAttemptJobDescriptionVersionId,
            runId: studioInterview.resumeReviewRunId,
          })
          .from(studioInterview)
          .where(eq(studioInterview.id, input.resumeRecordId))
          .for("update")
          .limit(1);
        if (current?.runId !== input.runId || current.attemptVersion !== snapshot.id) {
          return;
        }
        // SAFETY: the strict qualitative schema parsed this JSON-compatible artifact above.
        await tx.insert(resumeEvaluationVersion).values({
          artifact: evaluation as JsonValue,
          contractVersion: QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION,
          createdAt: now,
          id: randomUUID(),
          jobDescriptionVersionId: snapshot.id,
          numericScore: null,
          organizationId: input.organizationId,
          recommendationLevel: evaluation.recommendationLevel,
          resumeRecordId: input.resumeRecordId,
          runId: input.runId,
        });
        await tx
          .update(studioInterview)
          .set({
            qualitativeAttemptJobDescriptionVersionId: null,
            qualitativeJobDescriptionVersionId: snapshot.id,
            qualitativeRecommendationLevel: evaluation.recommendationLevel,
            qualitativeResumeEvaluation: evaluation,
            resumeEvaluationArtifactMode: "qualitative",
            resumeEvaluationAttemptMode: "qualitative",
            resumeReview: null,
            resumeReviewError: null,
            resumeReviewGeneratedAt: now,
            resumeReviewRunId: null,
            resumeReviewStatus: "ready",
            resumeScreeningError: null,
            resumeScreeningEvaluatedAt: null,
            resumeScreeningResult: null,
            resumeScreeningStatus: "idle",
            structuredCompositeScore: null,
            structuredGateSortRank: null,
            structuredGateStatus: null,
            structuredResumeEvaluation: null,
            structuredScoreGrade: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(studioInterview.id, input.resumeRecordId),
              eq(studioInterview.organizationId, input.organizationId),
              eq(studioInterview.jobDescriptionId, jobId),
              eq(studioInterview.resumeReviewRunId, input.runId),
              eq(studioInterview.qualitativeAttemptJobDescriptionVersionId, snapshot.id),
            ),
          );
      });
    } catch (error) {
      await this.failRecord(
        input,
        error instanceof Error ? error.message : String(error),
        context.hasAttemptsRemaining,
      );
      throw error;
    }
  }

  private async failRecord(
    input: { organizationId: string; resumeRecordId: string; runId: string },
    message: string,
    retrying: boolean,
  ) {
    if (!retrying) {
      const [record] = await this.database
        .select({ versionId: studioInterview.qualitativeAttemptJobDescriptionVersionId })
        .from(studioInterview)
        .where(
          and(
            eq(studioInterview.id, input.resumeRecordId),
            eq(studioInterview.resumeReviewRunId, input.runId),
          ),
        )
        .limit(1);
      if (record?.versionId) {
        await this.database
          .insert(resumeEvaluationFailure)
          .values({
            contractVersion: QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION,
            errorMessage: message.slice(0, 1000),
            id: randomUUID(),
            jobDescriptionVersionId: record.versionId,
            organizationId: input.organizationId,
            resumeRecordId: input.resumeRecordId,
            runId: input.runId,
          })
          .onConflictDoNothing();
      }
    }
    await this.database
      .update(studioInterview)
      .set({
        qualitativeAttemptJobDescriptionVersionId: retrying ? undefined : null,
        resumeReviewError: retrying ? null : message.slice(0, 1000),
        resumeReviewStatus: retrying ? "queued" : "failed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
          eq(studioInterview.resumeReviewRunId, input.runId),
        ),
      );
  }
}
