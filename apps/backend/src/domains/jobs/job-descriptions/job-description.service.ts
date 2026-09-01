/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-conditional-empty-object-spread -- Database conflict causes and versioned job-description payloads are normalized at this boundary; conditional properties intentionally preserve the legacy response omission contract. */
import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { minimaxVoiceSchema } from "@arc/db-schema/minimax-voices";
import {
  department,
  globalConfig,
  interviewer,
  jobDescription,
  jobDescriptionEvaluationUpgradeDraft,
  jobDescriptionInterviewer,
  jobDescriptionVersion,
  referralLink,
  studioInterview,
} from "@arc/db-schema/schema";
import {
  createDefaultJobDescriptionStructuredConfig,
  parseStoredJobDescriptionStructuredConfig,
} from "@arc/db-schema/job-description-structured-config";
import { sha256HexOfBytes } from "@arc/shared/file-hash";
import { validateJobDescriptionInterviewerDepartments } from "@arc/shared/job-description-interviewers";
import { parseListTextFilters } from "@arc/shared/list-text-filters";
import {
  createDefaultResumeScreeningPolicy,
  resumeScreeningPolicySchema,
} from "@arc/shared/resume-screening";
import { and, asc, count, desc, eq, ilike, inArray, max, ne, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { z } from "zod";
import { BackgroundQueueProducerService } from "../../../background/background-queue-producer.service.js";
import { CANDIDATE_SEMANTIC_INDEX_COMMANDS } from "../../../domains/candidate-lifecycle/public.js";
import type { CandidateSemanticIndexCommands } from "../../../domains/candidate-lifecycle/public.js";
import { WORKSPACE_DATABASE_PORT } from "../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";
import type {
  jobDescriptionAiGenerateInputSchema,
  jobDescriptionListQuerySchema,
  jobDescriptionOperationalSchema,
  jobDescriptionRecommendationsInputSchema,
  jobDescriptionSaveSchema,
  jobDescriptionScreeningPolicyInputSchema,
} from "./job-description.schemas.js";
import { generateJobDraft, generateScreeningPolicy } from "./job-ai-generation.js";
import { recommendJobCandidates } from "./job-recommendations.js";

type ListQuery = z.infer<typeof jobDescriptionListQuerySchema>;
type SaveInput = z.infer<typeof jobDescriptionSaveSchema>;
type OperationalInput = z.infer<typeof jobDescriptionOperationalSchema>;
type AiGenerateInput = z.infer<typeof jobDescriptionAiGenerateInputSchema>;
type ScreeningPolicyInput = z.infer<typeof jobDescriptionScreeningPolicyInputSchema>;
type RecommendationsInput = z.infer<typeof jobDescriptionRecommendationsInputSchema>;

const DEFAULT_JOB_CODE_PREFIX = "AUR";
const JOB_CODE_SPACE = 36 ** 4;
const JOB_CODE_CANDIDATES = 32;

function normalizePrefix(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{3}$/.test(normalized) ? normalized : DEFAULT_JOB_CODE_PREFIX;
}

function codeCandidates(prefix: string | null | undefined) {
  const start = Math.min(
    JOB_CODE_SPACE - 1,
    Math.max(0, Math.trunc(Math.random() * JOB_CODE_SPACE)),
  );
  const normalized = normalizePrefix(prefix);
  return Array.from(
    { length: JOB_CODE_CANDIDATES },
    (_, offset) =>
      `${normalized}${((start + offset) % JOB_CODE_SPACE).toString(36).toUpperCase().padStart(4, "0")}`,
  );
}

function csv(value?: string) {
  const values =
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? [];
  return values.length ? [...new Set(values)] : undefined;
}

function dedupe(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isCodeConflict(error: unknown): boolean {
  if (!(error && typeof error === "object")) {
    return false;
  }
  const value = error as { cause?: unknown; code?: unknown; constraint?: unknown };
  return (
    value.code === "23505" ||
    value.constraint === "job_description_org_code_uq" ||
    isCodeConflict(value.cause)
  );
}

function parsePolicy(value: typeof jobDescription.$inferSelect.resumeScreeningPolicy) {
  const parsed = resumeScreeningPolicySchema.safeParse(value);
  return parsed.success ? parsed.data : createDefaultResumeScreeningPolicy();
}

function parseStructured(value: typeof jobDescription.$inferSelect.structuredConfig) {
  try {
    return value
      ? parseStoredJobDescriptionStructuredConfig(value)
      : createDefaultJobDescriptionStructuredConfig();
  } catch {
    return createDefaultJobDescriptionStructuredConfig();
  }
}

@Injectable()
export class JobDescriptionService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(BackgroundQueueProducerService)
    private readonly queueProducer: BackgroundQueueProducerService,
    @Inject(CANDIDATE_SEMANTIC_INDEX_COMMANDS)
    private readonly semanticIndex: CandidateSemanticIndexCommands,
  ) {}

  aiGenerate(input: AiGenerateInput) {
    return generateJobDraft(input);
  }

  async generateScreeningPolicy(input: ScreeningPolicyInput) {
    return { policy: await generateScreeningPolicy(input) };
  }

  async recommendations(organizationId: string, id: string, input: RecommendationsInput) {
    const job = await this.load(organizationId, id);
    if (job.lifecycleStatus !== "published") {
      throw new NotFoundException("在招岗位不存在。");
    }
    return recommendJobCandidates(this.database, {
      excludeAlreadyLinked: input.excludeAlreadyLinked,
      job: { id: job.id, name: job.name, prompt: job.prompt },
      limit: input.limit,
      organizationId,
    });
  }

  private async validateReferences(organizationId: string, input: OperationalInput) {
    const interviewerIds = dedupe(input.interviewerIds);
    const [[departmentRow], interviewerRows] = await Promise.all([
      this.database
        .select({ id: department.id })
        .from(department)
        .where(
          and(eq(department.id, input.departmentId), eq(department.organizationId, organizationId)),
        )
        .limit(1),
      this.database
        .select({
          departmentId: interviewer.departmentId,
          departmentName: department.name,
          id: interviewer.id,
          name: interviewer.name,
        })
        .from(interviewer)
        .leftJoin(department, eq(interviewer.departmentId, department.id))
        .where(
          and(
            inArray(interviewer.id, interviewerIds),
            eq(interviewer.organizationId, organizationId),
          ),
        ),
    ]);
    if (!departmentRow) {
      throw new BadRequestException("所选部门不存在。");
    }
    if (interviewerRows.length !== interviewerIds.length) {
      throw new BadRequestException("存在无效的面试官，请刷新后重试。");
    }
    const error = validateJobDescriptionInterviewerDepartments({
      allowCrossDepartmentInterviewers: input.allowCrossDepartmentInterviewers,
      departmentId: input.departmentId,
      interviewers: interviewerRows,
    });
    if (error) {
      throw new BadRequestException(error);
    }
    return interviewerIds;
  }

  private async prefix(organizationId: string) {
    const rows = await this.database
      .select({ prefix: globalConfig.jobCodePrefix })
      .from(globalConfig)
      .where(eq(globalConfig.organizationId, organizationId))
      .limit(1);
    return rows[0]?.prefix ?? DEFAULT_JOB_CODE_PREFIX;
  }

  async generateCode(organizationId: string) {
    const candidates = codeCandidates(await this.prefix(organizationId));
    const used = await this.database
      .select({ code: jobDescription.code })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.organizationId, organizationId),
          inArray(jobDescription.code, candidates),
        ),
      );
    const usedCodes = new Set(used.flatMap((row) => (row.code ? [row.code] : [])));
    const code = candidates.find((candidate) => !usedCodes.has(candidate));
    if (!code) {
      throw new ConflictException("岗位编码候选已用尽，请重试。");
    }
    return { code };
  }

  private async interviewerIdsForFilter(organizationId: string, ids: string[] | undefined) {
    if (!ids?.length) {
      return;
    }
    const rows = await this.database
      .select({ id: jobDescriptionInterviewer.jobDescriptionId })
      .from(jobDescriptionInterviewer)
      .innerJoin(interviewer, eq(jobDescriptionInterviewer.interviewerId, interviewer.id))
      .where(
        and(
          inArray(jobDescriptionInterviewer.interviewerId, ids),
          eq(interviewer.organizationId, organizationId),
        ),
      );
    return [...new Set(rows.map((row) => row.id))];
  }

  private async rows(organizationId: string, query?: ListQuery, recruitingOnly = false) {
    const departmentIds = csv(query?.departmentId);
    const interviewerIds = csv(query?.interviewerId);
    const matchingJobIds = await this.interviewerIdsForFilter(organizationId, interviewerIds);
    const text = parseListTextFilters(query?.textFilters);
    const filters: SQL[] = [eq(jobDescription.organizationId, organizationId)];
    if (recruitingOnly) {
      filters.push(eq(jobDescription.lifecycleStatus, "published"));
    }
    if (query?.search) {
      const searchFilter = or(
        ilike(jobDescription.name, `%${query.search}%`),
        ilike(jobDescription.prompt, `%${query.search}%`),
      );
      if (searchFilter) {
        filters.push(searchFilter);
      }
    }
    if (text.name) {
      filters.push(ilike(jobDescription.name, `%${text.name}%`));
    }
    if (text.prompt) {
      filters.push(ilike(jobDescription.prompt, `%${text.prompt}%`));
    }
    if (departmentIds) {
      filters.push(inArray(jobDescription.departmentId, departmentIds));
    }
    if (interviewerIds) {
      filters.push(
        matchingJobIds?.length
          ? inArray(jobDescription.id, matchingJobIds)
          : eq(jobDescription.id, "__never__"),
      );
    }
    const sortColumns = {
      createdAt: jobDescription.createdAt,
      name: jobDescription.name,
      updatedAt: jobDescription.updatedAt,
    };
    const sortColumn = query?.sortBy ? sortColumns[query.sortBy] : sortColumns.createdAt;
    const order = query?.sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);
    return this.database
      .select({ departmentName: department.name, job: jobDescription })
      .from(jobDescription)
      .leftJoin(department, eq(jobDescription.departmentId, department.id))
      .where(and(...filters))
      .orderBy(order);
  }

  private async enrich(
    rows: { departmentName?: string | null; job: typeof jobDescription.$inferSelect }[],
  ) {
    const ids = rows.map((row) => row.job.id);
    if (!ids.length) {
      return [];
    }
    const [links, counts, drafts] = await Promise.all([
      this.database
        .select({
          id: interviewer.id,
          jobId: jobDescriptionInterviewer.jobDescriptionId,
          name: interviewer.name,
          voice: interviewer.voice,
        })
        .from(jobDescriptionInterviewer)
        .innerJoin(interviewer, eq(jobDescriptionInterviewer.interviewerId, interviewer.id))
        .where(inArray(jobDescriptionInterviewer.jobDescriptionId, ids))
        .orderBy(asc(interviewer.name)),
      this.database
        .select({ count: count(), jobId: studioInterview.jobDescriptionId })
        .from(studioInterview)
        .where(
          and(
            inArray(studioInterview.jobDescriptionId, ids),
            ne(studioInterview.pipelineStage, "closed"),
          ),
        )
        .groupBy(studioInterview.jobDescriptionId),
      this.database
        .select({ id: jobDescriptionEvaluationUpgradeDraft.jobDescriptionId })
        .from(jobDescriptionEvaluationUpgradeDraft)
        .where(inArray(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, ids)),
    ]);
    const interviewerMap = new Map<
      string,
      { id: string; name: string; voice: z.infer<typeof minimaxVoiceSchema> }[]
    >();
    for (const link of links) {
      const values = interviewerMap.get(link.jobId) ?? [];
      values.push({ id: link.id, name: link.name, voice: minimaxVoiceSchema.parse(link.voice) });
      interviewerMap.set(link.jobId, values);
    }
    const countMap = new Map(counts.map((row) => [row.jobId, row.count]));
    const draftIds = new Set(drafts.map((row) => row.id));
    return rows.map((row) =>
      this.serialize(
        row.job,
        interviewerMap.get(row.job.id) ?? [],
        draftIds.has(row.job.id),
        row.departmentName,
        countMap.get(row.job.id) ?? 0,
      ),
    );
  }

  private serialize(
    row: typeof jobDescription.$inferSelect,
    interviewers: { id: string; name: string; voice: z.infer<typeof minimaxVoiceSchema> }[],
    hasEvaluationUpgradeDraft: boolean,
    departmentName?: string | null,
    resumeCount?: number,
  ) {
    return {
      allowCrossDepartmentInterviewers: row.allowCrossDepartmentInterviewers,
      code: row.code,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
      deductionRuleSetVersion: row.deductionRuleSetVersion,
      departmentId: row.departmentId,
      ...(departmentName === undefined ? {} : { departmentName }),
      description: row.description,
      evaluationBlueprint: row.evaluationBlueprint,
      evaluationBlueprintHash: row.evaluationBlueprintHash,
      evaluationBlueprintPreview: row.evaluationBlueprintPreview,
      evaluationBlueprintPreviewGeneratedAt:
        row.evaluationBlueprintPreviewGeneratedAt?.toISOString() ?? null,
      evaluationBlueprintPreviewHash: row.evaluationBlueprintPreviewHash,
      evaluationBlueprintPreviewInputHash: row.evaluationBlueprintPreviewInputHash,
      evaluationBlueprintSchemaVersion: row.evaluationBlueprintSchemaVersion,
      evaluationMode: row.evaluationMode,
      evaluationUpgradedAt: row.evaluationUpgradedAt?.toISOString() ?? null,
      evaluationUpgradedBy: row.evaluationUpgradedBy,
      hasEvaluationUpgradeDraft,
      id: row.id,
      interviewerIds: interviewers.map((value) => value.id),
      ...(departmentName === undefined ? {} : { interviewers }),
      lifecycleStatus: row.lifecycleStatus,
      name: row.name,
      presetQuestions: row.presetQuestions ?? [],
      prompt: row.prompt,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      ...(resumeCount === undefined ? {} : { resumeCount }),
      resumeScreeningPolicy: parsePolicy(row.resumeScreeningPolicy),
      resumeScreeningPolicyHash: row.resumeScreeningPolicyHash,
      resumeScreeningPolicyVersion: row.resumeScreeningPolicyVersion,
      structuredConfig: parseStructured(row.structuredConfig),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(organizationId: string, query: ListQuery) {
    const rows = await this.rows(organizationId, query);
    const total = rows.length;
    const start = (query.page - 1) * query.pageSize;
    return {
      page: query.page,
      pageSize: query.pageSize,
      records: await this.enrich(rows.slice(start, start + query.pageSize)),
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }

  async listAll(organizationId: string) {
    return {
      records: await this.enrich(
        await this.rows(organizationId, {
          page: 1,
          pageSize: 100,
          sortBy: "name",
          sortOrder: "asc",
        } as ListQuery),
      ),
    };
  }

  async listRecruiting(organizationId: string) {
    return {
      records: await this.enrich(
        await this.rows(
          organizationId,
          { page: 1, pageSize: 100, sortBy: "name", sortOrder: "asc" } as ListQuery,
          true,
        ),
      ),
    };
  }

  private async load(organizationId: string, id: string) {
    const rows = await this.database
      .select()
      .from(jobDescription)
      .where(and(eq(jobDescription.id, id), eq(jobDescription.organizationId, organizationId)))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("在招岗位不存在。");
    }
    const enriched = await this.enrich([{ departmentName: undefined, job: rows[0] }]);
    return enriched[0];
  }

  get(organizationId: string, id: string) {
    return this.load(organizationId, id);
  }

  private async enqueueIndex(organizationId: string, jobDescriptionId: string) {
    if (
      !(
        rawBackendEnvironment.QDRANT_URL?.trim() &&
        (rawBackendEnvironment.RESUME_EMBEDDING_API_KEY?.trim() ||
          rawBackendEnvironment.ALIBABA_API_KEY?.trim())
      )
    ) {
      return;
    }
    try {
      await this.queueProducer.enqueueResumeSemanticIndexJobs([
        { organizationId, sourceId: jobDescriptionId, sourceType: "job_description" },
      ]);
    } catch (error) {
      console.warn("[jd-semantic-index] enqueue failed", {
        jobDescriptionId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async create(organizationId: string, actorId: string, input: SaveInput) {
    const interviewerIds = await this.validateReferences(organizationId, input);
    const now = new Date();
    const generated = codeCandidates(await this.prefix(organizationId));
    const requested = input.code?.toUpperCase();
    const candidates = requested
      ? [requested, ...generated.filter((value) => value !== requested)]
      : generated;
    for (const code of candidates) {
      const id = crypto.randomUUID();
      const record: typeof jobDescription.$inferInsert = {
        allowCrossDepartmentInterviewers: input.allowCrossDepartmentInterviewers,
        code,
        createdAt: now,
        createdBy: actorId,
        departmentId: input.departmentId,
        description: null,
        evaluationMode: "qualitative",
        id,
        lifecycleStatus: "published",
        name: input.name.trim(),
        organizationId,
        presetQuestions: [],
        prompt: input.prompt.trim(),
        publishedAt: now,
        resumeScreeningPolicy: null,
        structuredConfig: createDefaultJobDescriptionStructuredConfig(),
        updatedAt: now,
      };
      try {
        await this.database.transaction(async (tx) => {
          await tx.insert(jobDescription).values(record);
          await tx.insert(jobDescriptionVersion).values({
            createdAt: now,
            createdBy: actorId,
            id: crypto.randomUUID(),
            jobDescriptionId: id,
            jobDescriptionName: input.name.trim(),
            organizationId,
            prompt: input.prompt.trim(),
            version: 1,
          });
          await tx.insert(jobDescriptionInterviewer).values(
            interviewerIds.map((interviewerId) => ({
              createdAt: now,
              interviewerId,
              jobDescriptionId: id,
            })),
          );
        });
        await this.enqueueIndex(organizationId, id);
        return this.load(organizationId, id);
      } catch (error) {
        if (!isCodeConflict(error)) {
          throw error;
        }
      }
    }
    throw new ConflictException("岗位编码候选已用尽，请重试。");
  }

  async operational(organizationId: string, id: string, input: OperationalInput) {
    await this.load(organizationId, id);
    const interviewerIds = await this.validateReferences(organizationId, input);
    const now = new Date();
    await this.database.transaction(async (tx) => {
      await tx
        .update(jobDescription)
        .set({
          allowCrossDepartmentInterviewers: input.allowCrossDepartmentInterviewers,
          departmentId: input.departmentId,
          updatedAt: now,
        })
        .where(and(eq(jobDescription.id, id), eq(jobDescription.organizationId, organizationId)));
      await tx
        .delete(jobDescriptionInterviewer)
        .where(eq(jobDescriptionInterviewer.jobDescriptionId, id));
      await tx.insert(jobDescriptionInterviewer).values(
        interviewerIds.map((interviewerId) => ({
          createdAt: now,
          interviewerId,
          jobDescriptionId: id,
        })),
      );
    });
    await this.enqueueIndex(organizationId, id);
    return this.load(organizationId, id);
  }

  async update(organizationId: string, actorId: string, id: string, input: SaveInput) {
    await this.load(organizationId, id);
    const interviewerIds = await this.validateReferences(organizationId, input);
    const now = new Date();
    try {
      const changed = await this.database.transaction(async (tx) => {
        const locked = await tx
          .select({ code: jobDescription.code, publishedAt: jobDescription.publishedAt })
          .from(jobDescription)
          .where(and(eq(jobDescription.id, id), eq(jobDescription.organizationId, organizationId)))
          .limit(1)
          .for("update");
        if (!locked[0]) {
          return false;
        }
        await tx
          .update(jobDescription)
          .set({
            allowCrossDepartmentInterviewers: input.allowCrossDepartmentInterviewers,
            code: input.code?.toUpperCase() ?? locked[0].code,
            departmentId: input.departmentId,
            evaluationMode: "qualitative",
            lifecycleStatus: "published",
            name: input.name.trim(),
            prompt: input.prompt.trim(),
            publishedAt: locked[0].publishedAt ?? now,
            updatedAt: now,
          })
          .where(and(eq(jobDescription.id, id), eq(jobDescription.organizationId, organizationId)));
        await tx
          .delete(jobDescriptionInterviewer)
          .where(eq(jobDescriptionInterviewer.jobDescriptionId, id));
        await tx.insert(jobDescriptionInterviewer).values(
          interviewerIds.map((interviewerId) => ({
            createdAt: now,
            interviewerId,
            jobDescriptionId: id,
          })),
        );
        const latest = await tx
          .select({ version: max(jobDescriptionVersion.version) })
          .from(jobDescriptionVersion)
          .where(eq(jobDescriptionVersion.jobDescriptionId, id));
        await tx.insert(jobDescriptionVersion).values({
          createdAt: now,
          createdBy: actorId,
          id: crypto.randomUUID(),
          jobDescriptionId: id,
          jobDescriptionName: input.name.trim(),
          organizationId,
          prompt: input.prompt.trim(),
          version: (latest[0]?.version ?? 0) + 1,
        });
        return true;
      });
      if (!changed) {
        throw new NotFoundException("在招岗位不存在。");
      }
    } catch (error) {
      if (isCodeConflict(error)) {
        throw new ConflictException("岗位编码已被占用，请重新生成。");
      }
      throw error;
    }
    await this.enqueueIndex(organizationId, id);
    return this.load(organizationId, id);
  }

  async referralLink(organizationId: string, actorId: string, id: string, origin: string) {
    const existing = await this.load(organizationId, id);
    if (existing.lifecycleStatus !== "published") {
      throw new NotFoundException("在招岗位不存在。");
    }
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const tokenHash = await sha256HexOfBytes(new TextEncoder().encode(token));
    const now = new Date();
    await this.database.insert(referralLink).values({
      createdAt: now,
      createdBy: actorId,
      id: crypto.randomUUID(),
      jobDescriptionId: id,
      organizationId,
      tokenHash,
      updatedAt: now,
    });
    return { url: `${origin}/referrals/${encodeURIComponent(token)}` };
  }

  async remove(organizationId: string, id: string) {
    await this.load(organizationId, id);
    const rows = await this.database
      .select({ count: count() })
      .from(studioInterview)
      .where(
        and(eq(studioInterview.jobDescriptionId, id), ne(studioInterview.pipelineStage, "closed")),
      );
    const resumeCount = rows[0]?.count ?? 0;
    if (resumeCount > 0) {
      throw new ConflictException(
        `当前有 ${resumeCount} 条简历关联到该在招岗位，无法删除；请先在招聘台中调整或删除这些候选人。`,
      );
    }
    await this.database
      .delete(jobDescription)
      .where(and(eq(jobDescription.id, id), eq(jobDescription.organizationId, organizationId)));
    try {
      await this.semanticIndex.deleteJobDescription(organizationId, id);
    } catch (error) {
      console.warn("[jd-semantic-index] delete marker failed", {
        id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return { success: true } as const;
  }
}
