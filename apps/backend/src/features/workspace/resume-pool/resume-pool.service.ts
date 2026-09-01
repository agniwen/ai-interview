/* oxlint-disable complexity, max-lines, no-nested-ternary, prefer-destructuring, unicorn/consistent-function-scoping -- This one-to-one migrated resume-pool workflow keeps its transactional branches and DTO projection co-located to preserve the legacy contract. */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  jobDescription,
  member,
  organization,
  resumeDuplicateMatch,
  resumeJobMatchCandidate,
  resumeJobMatchRun,
  resumePoolEvent,
  resumePoolImport,
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import { isResumeParseQueueConfigured } from "@arc/resume-parse-queue/resume-parse";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import type { z } from "zod";
import { BackgroundQueueProducerService } from "../../../background/background-queue-producer.service.js";
import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import {
  WORKSPACE_DATABASE_PORT,
  WORKSPACE_DOCUMENT_PREVIEW_PORT,
  WORKSPACE_OBJECT_STORAGE_PORT,
  WORKSPACE_RESUME_SEMANTIC_PORT,
} from "../workspace.ports.js";
import type {
  WorkspaceDatabasePort,
  WorkspaceDocumentPreviewPort,
  WorkspaceObjectStoragePort,
  WorkspaceResumeSemanticPort,
} from "../workspace.ports.js";
import { ResumeUploadBatchService } from "../resume-upload-batches/resume-upload-batch.service.js";
import type { UploadedResumeFile } from "../resume-upload-batches/resume-upload-batch.service.js";
import type {
  resumePoolBindSchema,
  resumePoolCreateInputSchema,
  resumePoolImportInputSchema,
  resumePoolListQuerySchema,
} from "./resume-pool.schemas.js";
import { recommendJobsForPoolResume } from "./resume-pool-recommendations.js";

type ListQuery = z.infer<typeof resumePoolListQuerySchema>;
type CreateInput = z.infer<typeof resumePoolCreateInputSchema>;
type ImportInput = z.infer<typeof resumePoolImportInputSchema>;
type BindInput = z.infer<typeof resumePoolBindSchema>;
type PoolRow = typeof resumePoolItem.$inferSelect;

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}
function profileHighlights(profile: PoolRow["resumeProfile"]) {
  if (!profile) {
    return {
      educationItems: [],
      educationLines: [],
      latestCompany: null,
      latestCompanyDetail: null,
      latestProject: null,
      latestProjectDetail: null,
      personalStrengths: [],
      schools: [],
    };
  }
  const clean = (value: string | null | undefined) =>
    value?.trim() && value.trim() !== "未发现信息" ? value.trim() : null;
  const latestWork = profile.workExperiences.toReversed().find((item) => clean(item.company));
  const latestProject = profile.projectExperiences.toReversed().find((item) => clean(item.name));
  return {
    educationItems: (profile.educationExperiences ?? []).map((item) => ({
      degree: item.degree,
      major: item.major,
      period: item.period,
      school: item.school,
    })),
    educationLines: (profile.educationExperiences ?? []).map((item) =>
      [item.school, item.major, item.degree, item.period].filter(Boolean).join(" · "),
    ),
    latestCompany: clean(latestWork?.company),
    latestCompanyDetail: latestWork
      ? {
          period: clean(latestWork.period),
          role: clean(latestWork.role),
          summary: clean(latestWork.summary),
        }
      : null,
    latestProject: clean(latestProject?.name),
    latestProjectDetail: latestProject
      ? {
          period: clean(latestProject.period),
          role: clean(latestProject.role),
          summary: clean(latestProject.summary),
        }
      : null,
    personalStrengths: profile.personalStrengths.map(clean).filter(Boolean),
    schools: profile.schools.map(clean).filter(Boolean),
  };
}

@Injectable()
export class ResumePoolService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(WORKSPACE_DOCUMENT_PREVIEW_PORT) private readonly preview: WorkspaceDocumentPreviewPort,
    @Inject(WORKSPACE_OBJECT_STORAGE_PORT) private readonly storage: WorkspaceObjectStoragePort,
    @Inject(WORKSPACE_RESUME_SEMANTIC_PORT) private readonly semantic: WorkspaceResumeSemanticPort,
    @Inject(ResumeUploadBatchService) private readonly uploads: ResumeUploadBatchService,
    @Inject(BackgroundQueueProducerService)
    private readonly queueProducer: BackgroundQueueProducerService,
  ) {}

  private visible(
    row: PoolRow,
    organizationId: string,
    actorId: string,
    visibleCreatorIds: string[] | null,
  ) {
    if (row.organizationId !== organizationId || row.status !== "active") {
      return false;
    }
    if (row.scope === "public") {
      return true;
    }
    return visibleCreatorIds === null ? true : visibleCreatorIds.includes(row.createdBy ?? actorId);
  }

  private async dto(row: PoolRow) {
    const [imports, uploaders, jobs, duplicate] = await Promise.all([
      this.database
        .select({
          creatorImage: user.image,
          creatorName: user.name,
          importedAt: resumePoolImport.importedAt,
          resumeRecordId: resumePoolImport.importedResumeRecordId,
        })
        .from(resumePoolImport)
        .leftJoin(user, eq(user.id, resumePoolImport.importedBy))
        .where(
          and(
            eq(resumePoolImport.poolItemId, row.id),
            row.organizationId
              ? eq(resumePoolImport.organizationId, row.organizationId)
              : undefined,
          ),
        )
        .orderBy(desc(resumePoolImport.importedAt)),
      this.database
        .select({
          email: user.email,
          image: user.image,
          name: user.name,
          organizationName: organization.name,
        })
        .from(resumePoolItem)
        .leftJoin(user, eq(user.id, resumePoolItem.createdBy))
        .leftJoin(organization, eq(organization.id, resumePoolItem.organizationId))
        .where(eq(resumePoolItem.id, row.id))
        .limit(1),
      row.jobDescriptionId
        ? this.database
            .select({ name: jobDescription.name })
            .from(jobDescription)
            .where(eq(jobDescription.id, row.jobDescriptionId))
            .limit(1)
        : Promise.resolve([]),
      this.database
        .select({
          level: resumeDuplicateMatch.level,
          matchedSourceId: resumeDuplicateMatch.matchedSourceId,
          reasons: resumeDuplicateMatch.reasons,
          score: resumeDuplicateMatch.score,
          signals: resumeDuplicateMatch.signals,
          similarity: resumeDuplicateMatch.similarity,
        })
        .from(resumeDuplicateMatch)
        .where(
          and(
            eq(resumeDuplicateMatch.organizationId, row.organizationId ?? ""),
            eq(resumeDuplicateMatch.sourceType, "resume_pool_item"),
            eq(resumeDuplicateMatch.sourceId, row.id),
            eq(resumeDuplicateMatch.matchedSourceType, "studio_interview"),
            eq(resumeDuplicateMatch.status, "active"),
          ),
        )
        .orderBy(desc(resumeDuplicateMatch.score))
        .limit(1),
    ]);
    const latest = imports[0];
    const uploader = uploaders[0];
    const match = duplicate[0];
    return {
      candidateEmail: row.candidateEmail,
      candidateName: row.candidateName,
      candidatePhone: row.candidatePhone,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
      duplicateMatch: match
        ? {
            highestLevel: match.level,
            matchCount: 1,
            matchedResumeRecordId: match.matchedSourceId,
            reasons: match.reasons,
            score: match.score,
            signals: match.signals,
            similarity: match.similarity,
          }
        : null,
      id: row.id,
      importedAt: iso(latest?.importedAt ?? null),
      importedRecords: imports.map((item) => ({
        creatorImage: item.creatorImage,
        creatorName: item.creatorName,
        importedAt: item.importedAt.toISOString(),
        resumeRecordId: item.resumeRecordId,
      })),
      importedResumeRecordId: latest?.resumeRecordId ?? null,
      jobBindingMode: row.jobDescriptionId ? ("manual" as const) : null,
      jobDescriptionId: row.jobDescriptionId,
      jobDescriptionName: jobs[0]?.name ?? null,
      masteredSkills: [
        ...new Set((row.resumeProfile?.skills ?? []).map((item) => item.trim()).filter(Boolean)),
      ],
      notes: row.notes,
      organizationId: row.organizationId,
      profileHighlights: profileHighlights(row.resumeProfile),
      publishedAt: iso(row.publishedAt),
      publishedBy: row.publishedBy,
      qualitativeRecommendationLevel: row.qualitativeRecommendationLevel,
      qualitativeResumeEvaluation: row.qualitativeResumeEvaluation,
      qualitativeResumeSummary: row.qualitativeResumeSummary,
      resumeContentHash: row.resumeContentHash,
      resumeEvaluationContractVersion: row.resumeEvaluationContractVersion,
      resumeEvaluationGeneratedAt: iso(row.resumeEvaluationGeneratedAt),
      resumeFileName: row.resumeFileName,
      resumeParseError: row.resumeParseError,
      resumeParseRetryable: row.resumeParseStatus === "failed",
      resumeParseStatus: row.resumeParseStatus,
      resumeParsedAt: iso(row.resumeParsedAt),
      resumeProfile: row.resumeProfile,
      resumeProfileSnapshot: row.resumeProfile ?? {},
      resumeStorageKey: row.resumeStorageKey,
      scope: row.scope,
      skillsNormalized: row.skillsNormalized,
      sourceChannel: row.sourceChannel,
      sourceOrganizationId: row.sourceOrganizationId,
      sourcePoolItemId: row.sourcePoolItemId,
      sourceUserId: row.sourceUserId,
      status: row.status,
      targetRole: row.targetRole,
      updatedAt: row.updatedAt.toISOString(),
      uploaderEmail: uploader?.email ?? null,
      uploaderImage: uploader?.image ?? null,
      uploaderName: uploader?.name ?? null,
      uploaderOrganizationName: uploader?.organizationName ?? null,
      workYears: row.resumeProfile?.workYears ?? null,
    };
  }

  async list(
    organizationId: string,
    actorId: string,
    visibleCreatorIds: string[] | null,
    query: ListQuery,
  ) {
    const requested = query.uploaderIds
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    let creators =
      query.scope === "private"
        ? query.uploaderId && query.uploaderId !== "all"
          ? [query.uploaderId]
          : [actorId]
        : requested;
    if (visibleCreatorIds) {
      creators = (creators ?? visibleCreatorIds).filter((id) => visibleCreatorIds.includes(id));
    }
    if (query.scope === "private" && creators?.length === 0) {
      return { records: [], total: 0 };
    }
    const imported = this.database
      .select({ one: resumePoolImport.id })
      .from(resumePoolImport)
      .where(
        and(
          eq(resumePoolImport.poolItemId, resumePoolItem.id),
          eq(resumePoolImport.organizationId, organizationId),
        ),
      );
    const where = and(
      eq(resumePoolItem.organizationId, organizationId),
      eq(resumePoolItem.scope, query.scope),
      eq(resumePoolItem.status, "active"),
      creators ? inArray(resumePoolItem.createdBy, creators) : undefined,
      query.createdFrom
        ? gte(resumePoolItem.createdAt, new Date(`${query.createdFrom}T00:00:00+08:00`))
        : undefined,
      query.createdTo
        ? lt(
            resumePoolItem.createdAt,
            new Date(new Date(`${query.createdTo}T00:00:00+08:00`).getTime() + 86_400_000),
          )
        : undefined,
      query.importStatus === "imported"
        ? exists(imported)
        : query.importStatus === "not_imported"
          ? notExists(imported)
          : undefined,
      query.sourceType === "referral"
        ? eq(resumePoolItem.sourceChannel, "referral")
        : query.sourceType === "non_referral"
          ? or(isNull(resumePoolItem.sourceChannel), ne(resumePoolItem.sourceChannel, "referral"))
          : undefined,
      query.search
        ? or(
            sql`${resumePoolItem.candidateName} ilike ${`%${query.search}%`}`,
            sql`${resumePoolItem.candidateEmail} ilike ${`%${query.search}%`}`,
            sql`${resumePoolItem.candidatePhone} ilike ${`%${query.search}%`}`,
          )
        : undefined,
    );
    const field =
      query.sortBy === "candidateName"
        ? resumePoolItem.candidateName
        : query.sortBy === "updatedAt"
          ? resumePoolItem.updatedAt
          : resumePoolItem.createdAt;
    const [total, rows] = await Promise.all([
      this.database.select({ count: count() }).from(resumePoolItem).where(where),
      this.database
        .select()
        .from(resumePoolItem)
        .where(where)
        .orderBy(query.sortOrder === "asc" ? asc(field) : desc(field), desc(resumePoolItem.id))
        .limit(query.limit)
        .offset(query.offset),
    ]);
    return {
      records: await Promise.all(rows.map((row) => this.dto(row))),
      total: total[0]?.count ?? 0,
    };
  }

  async uploaders(organizationId: string, visibleCreatorIds: string[] | null) {
    const rows = await this.database
      .select({ email: user.email, id: user.id, image: user.image, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.organizationId, organizationId),
          visibleCreatorIds ? inArray(member.userId, visibleCreatorIds) : undefined,
        ),
      )
      .orderBy(asc(user.name), asc(user.email));
    return { records: rows };
  }

  async get(
    organizationId: string,
    actorId: string,
    id: string,
    visibleCreatorIds: string[] | null,
    membershipOnly = false,
  ) {
    const rows = await this.database
      .select()
      .from(resumePoolItem)
      .where(eq(resumePoolItem.id, id))
      .limit(1);
    const row = rows[0];
    if (
      !row ||
      (!membershipOnly && !this.visible(row, organizationId, actorId, visibleCreatorIds)) ||
      (membershipOnly && (row.organizationId !== organizationId || row.status !== "active"))
    ) {
      throw new NotFoundException("记录不存在。", { errorCode: "RESUME_POOL_ITEM_NOT_FOUND" });
    }
    return this.dto(row);
  }

  async duplicateMatches(
    organizationId: string,
    actorId: string,
    id: string,
    visible: string[] | null,
  ) {
    await this.get(organizationId, actorId, id, visible);
    const matches = await this.database
      .select()
      .from(resumeDuplicateMatch)
      .where(
        and(
          eq(resumeDuplicateMatch.organizationId, organizationId),
          eq(resumeDuplicateMatch.sourceType, "resume_pool_item"),
          eq(resumeDuplicateMatch.sourceId, id),
          eq(resumeDuplicateMatch.status, "active"),
        ),
      )
      .orderBy(desc(resumeDuplicateMatch.score));
    return {
      matches: matches.map((match) => ({
        ...match,
        createdAt: match.createdAt.toISOString(),
        updatedAt: match.updatedAt.toISOString(),
      })),
    };
  }

  async getFile(
    organizationId: string,
    actorId: string,
    id: string,
    visible: string[] | null,
    membershipOnly = false,
  ) {
    const item = await this.get(organizationId, actorId, id, visible, membershipOnly);
    if (!item.resumeStorageKey) {
      throw new NotFoundException("简历文件已不可用。");
    }
    const object = await this.storage.getStream(item.resumeStorageKey);
    if (!object) {
      throw new NotFoundException("简历文件已不可用。");
    }
    return { ...object, filename: item.resumeFileName || "resume.pdf" };
  }
  async getPreview(
    organizationId: string,
    actorId: string,
    id: string,
    visible: string[] | null,
    membershipOnly = false,
  ) {
    const item = await this.get(organizationId, actorId, id, visible, membershipOnly);
    if (!item.resumeStorageKey) {
      throw new NotFoundException("简历文件已不可用。");
    }
    const object = await this.storage.getBytes(item.resumeStorageKey);
    if (!object) {
      throw new NotFoundException("简历文件已不可用。");
    }
    const filename = item.resumeFileName || "resume.pdf";
    const bytes = filename.toLowerCase().endsWith(".pptx")
      ? await this.preview.pptxToPdf({ bytes: object.bytes, filename })
      : object.bytes;
    return { bytes, filename: `${filename.replace(/\.[^.]+$/, "") || "resume"}.pdf` };
  }

  private async enqueuePoolParse(
    organizationId: string,
    actorId: string,
    id: string,
    source: { contentHash: string; fileSize: number; originalFileName: string; storageKey: string },
    bypassCache = false,
  ) {
    if (!isResumeParseQueueConfigured(rawBackendEnvironment)) {
      throw new ServiceUnavailableException("简历解析队列未配置 REDIS_URL。");
    }
    const batchId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const now = new Date();
    await this.database.transaction(async (tx) => {
      await tx.insert(resumeUploadBatch).values({
        createdBy: actorId,
        dedupPolicy: "create",
        id: batchId,
        jdMode: "none",
        organizationId,
        processedCount: 0,
        resumePoolScope: "private",
        status: "running",
        target: "resume_pool",
        totalCount: 1,
      });
      await tx.insert(resumeUploadBatchItem).values({
        attemptCount: 1,
        batchId,
        contentHash: source.contentHash,
        fileSize: source.fileSize,
        id: itemId,
        orderIndex: 0,
        organizationId,
        originalFileName: source.originalFileName,
        poolItemId: id,
        queuedAt: now,
        status: "pending",
        storageKey: source.storageKey,
      });
    });
    try {
      await this.queueProducer.enqueueResumeParseJobs([
        { batchId, bypassCache: bypassCache || undefined, itemId, organizationId, userId: actorId },
      ]);
    } catch (error) {
      await this.database
        .update(resumeUploadBatchItem)
        .set({ errorMessage: "简历解析入队失败。", finishedAt: new Date(), status: "failed" })
        .where(eq(resumeUploadBatchItem.id, itemId));
      throw new ServiceUnavailableException("简历解析队列入队失败。", { cause: error });
    }
  }

  async create(
    organizationId: string,
    actorId: string,
    input: CreateInput,
    file?: UploadedResumeFile,
  ) {
    if (!file) {
      throw new BadRequestException("请上传简历文件。");
    }
    if (input.jobDescriptionId) {
      await this.assertPublishedJob(organizationId, input.jobDescriptionId);
    }
    const source = await this.uploads.upload(organizationId, actorId, file);
    const id = crypto.randomUUID();
    await this.database.transaction(async (tx) => {
      await tx.insert(resumePoolItem).values({
        candidateEmail: input.candidateEmail,
        candidateName:
          input.candidateName?.trim() || file.originalname.replace(/\.[^.]+$/, "") || "未命名简历",
        candidatePhone: input.candidatePhone,
        createdBy: actorId,
        id,
        jobDescriptionId: input.jobDescriptionId,
        notes: input.notes,
        organizationId,
        resumeContentHash: source.contentHash,
        resumeFileName: source.originalFileName,
        resumeParseStatus: "processing",
        resumeStorageKey: source.storageKey,
        scope: input.scope,
        targetRole: input.targetRole,
      });
      await tx.insert(resumePoolEvent).values({
        actorId,
        id: crypto.randomUUID(),
        organizationId,
        poolItemId: id,
        type: "created",
      });
    });
    await this.enqueuePoolParse(organizationId, actorId, id, source);
    return this.get(organizationId, actorId, id, [actorId]);
  }

  async retryParse(organizationId: string, actorId: string, id: string, visible: string[] | null) {
    const item = await this.get(organizationId, actorId, id, visible);
    if (item.resumeParseStatus !== "failed") {
      throw new ConflictException("只有解析失败的简历可以重新解析。");
    }
    if (!(item.resumeStorageKey && item.resumeFileName)) {
      throw new ConflictException("该简历当前不能重新解析，请刷新后重试。");
    }
    await this.database
      .update(resumePoolItem)
      .set({ resumeParseError: null, resumeParseStatus: "processing", updatedAt: new Date() })
      .where(eq(resumePoolItem.id, id));
    await this.enqueuePoolParse(
      organizationId,
      actorId,
      id,
      {
        contentHash: item.resumeContentHash ?? id,
        fileSize: 0,
        originalFileName: item.resumeFileName,
        storageKey: item.resumeStorageKey,
      },
      true,
    );
    return { status: "queued" as const };
  }

  async delete(organizationId: string, actorId: string, id: string) {
    const deleted = await this.database
      .delete(resumePoolItem)
      .where(
        and(
          eq(resumePoolItem.id, id),
          eq(resumePoolItem.organizationId, organizationId),
          eq(resumePoolItem.createdBy, actorId),
          eq(resumePoolItem.status, "active"),
        ),
      )
      .returning({ id: resumePoolItem.id });
    if (!deleted[0]) {
      throw new NotFoundException("简历不存在或无权删除");
    }
    return { success: true as const };
  }

  async publish(organizationId: string, actorId: string, id: string) {
    const rows = await this.database
      .select()
      .from(resumePoolItem)
      .where(
        and(
          eq(resumePoolItem.id, id),
          eq(resumePoolItem.organizationId, organizationId),
          eq(resumePoolItem.createdBy, actorId),
          eq(resumePoolItem.scope, "private"),
        ),
      )
      .limit(1);
    const source = rows[0];
    if (!source) {
      throw new BadRequestException("简历池记录不存在或无权访问");
    }
    if (source.resumeParseStatus !== "ready") {
      throw new BadRequestException("简历解析完成后才能推送到公共简历池");
    }
    const publicId = crypto.randomUUID();
    const now = new Date();
    await this.database.transaction(async (tx) => {
      await tx.insert(resumePoolItem).values({
        ...source,
        createdAt: now,
        createdBy: actorId,
        id: publicId,
        jobDescriptionId: null,
        organizationId,
        publishedAt: now,
        publishedBy: actorId,
        scope: "public",
        sourceOrganizationId: organizationId,
        sourcePoolItemId: source.id,
        sourceUserId: actorId,
        updatedAt: now,
      });
      await tx.insert(resumePoolEvent).values([
        {
          actorId,
          id: crypto.randomUUID(),
          organizationId,
          payload: { publicPoolItemId: publicId },
          poolItemId: source.id,
          type: "published",
        },
        {
          actorId,
          id: crypto.randomUUID(),
          organizationId,
          payload: { sourcePoolItemId: source.id },
          poolItemId: publicId,
          type: "created",
        },
      ]);
    });
    await this.queueProducer
      .enqueueResumeSemanticIndexJobs([
        { organizationId, sourceId: publicId, sourceType: "resume_pool_item" },
      ])
      .catch((error) =>
        console.error("[resume-pool] semantic enqueue failed", { error, publicId }),
      );
    return this.get(organizationId, actorId, publicId, null);
  }

  private async assertPublishedJob(organizationId: string, id: string) {
    const rows = await this.database
      .select({ id: jobDescription.id })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.id, id),
          eq(jobDescription.organizationId, organizationId),
          eq(jobDescription.lifecycleStatus, "published"),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new BadRequestException("所选在招岗位不存在。");
    }
  }

  async bind(organizationId: string, actorId: string, id: string, input: BindInput) {
    await this.assertPublishedJob(organizationId, input.jobDescriptionId);
    const updated = await this.database.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(resumePoolItem)
        .where(
          and(
            eq(resumePoolItem.id, id),
            eq(resumePoolItem.organizationId, organizationId),
            or(eq(resumePoolItem.createdBy, actorId), eq(resumePoolItem.scope, "public")),
          ),
        )
        .for("update")
        .limit(1);
      const row = rows[0];
      if (!row) {
        return null;
      }
      await tx
        .update(resumePoolItem)
        .set({
          jobDescriptionId: input.jobDescriptionId,
          qualitativeJobDescriptionVersionId: null,
          qualitativeRecommendationLevel: null,
          qualitativeResumeEvaluation: null,
          qualitativeResumeSummary: null,
          resumeEvaluationContractVersion: null,
          resumeEvaluationGeneratedAt: null,
          resumeEvaluationInputHash: null,
          updatedAt: new Date(),
        })
        .where(eq(resumePoolItem.id, id));
      await tx.insert(resumePoolEvent).values({
        actorId,
        id: crypto.randomUUID(),
        organizationId,
        payload: {
          bindingMode: "manual",
          fromJobDescriptionId: row.jobDescriptionId,
          source: "hr_rebind",
          toJobDescriptionId: input.jobDescriptionId,
        },
        poolItemId: id,
        type: "bound",
      });
      return row;
    });
    if (!updated) {
      throw new NotFoundException("记录不存在。");
    }
    if (
      updated.resumeParseStatus === "ready" &&
      updated.resumeProfile &&
      isResumeParseQueueConfigured(rawBackendEnvironment)
    ) {
      await this.queueProducer
        .enqueueResumeReviewGenerationJobs([
          {
            jobDescriptionId: input.jobDescriptionId,
            organizationId,
            poolItemId: id,
            source: "resume_pool_upload",
          },
        ])
        .catch((error) => console.error("[resume-pool] review enqueue failed", { error, id }));
    }
    return this.get(organizationId, actorId, id, null);
  }

  async import(organizationId: string, actorId: string, id: string, input: ImportInput) {
    if (input.jobDescriptionId) {
      await this.assertPublishedJob(organizationId, input.jobDescriptionId);
    }
    const sourceRows = await this.database
      .select()
      .from(resumePoolItem)
      .where(
        and(
          eq(resumePoolItem.id, id),
          eq(resumePoolItem.organizationId, organizationId),
          eq(resumePoolItem.status, "active"),
          or(eq(resumePoolItem.scope, "public"), eq(resumePoolItem.createdBy, actorId)),
        ),
      )
      .limit(1);
    const source = sourceRows[0];
    if (!source) {
      throw new NotFoundException("记录不存在。");
    }
    if (source.resumeParseStatus !== "ready" || !source.resumeProfile) {
      throw new ConflictException("简历尚未解析完成。");
    }
    const existing = await this.database
      .select({ id: resumePoolImport.importedResumeRecordId })
      .from(resumePoolImport)
      .where(
        and(
          eq(resumePoolImport.poolItemId, id),
          eq(resumePoolImport.organizationId, organizationId),
        ),
      )
      .orderBy(desc(resumePoolImport.importedAt))
      .limit(1);
    if (!input.reimport && existing[0]) {
      return { resumeRecordId: existing[0].id, status: "imported" as const };
    }
    if (input.dedupPolicy === "check") {
      const matches = await this.semantic.findDuplicates({
        email: source.candidateEmail,
        name: source.candidateName,
        organizationId,
        phone: source.candidatePhone,
        resumeProfile: source.resumeProfile,
      });
      if (matches.length) {
        return { matches, status: "duplicate_found" as const };
      }
    }
    const recordId = crypto.randomUUID();
    const now = new Date();
    const pipelineStage =
      input.initialRecruitmentStage === "human_interview" ? "human_interview" : "screening";
    await this.database.transaction(async (tx) => {
      await tx.insert(studioInterview).values({
        candidateEmail: source.candidateEmail,
        candidateName: source.candidateName,
        candidatePhone: source.candidatePhone,
        createdBy: actorId,
        id: recordId,
        interviewQuestions: [],
        jobDescriptionId: input.jobDescriptionId,
        notes: source.notes,
        organizationId,
        pipelineStage,
        resumeContentHash: source.resumeContentHash,
        resumeFileName: source.resumeFileName,
        resumeParseStatus: "ready",
        resumeParsedAt: source.resumeParsedAt ?? now,
        resumeProfile: source.resumeProfile,
        resumeSourceImportedAt: now,
        resumeSourceImportedBy: actorId,
        resumeSourcePoolItemId: id,
        resumeSourceType: source.scope === "public" ? "public_pool" : "private_pool",
        resumeStorageKey: source.resumeStorageKey,
        resumeText: source.resumeText,
        targetRole: source.targetRole,
      });
      await tx.insert(resumePoolImport).values({
        id: crypto.randomUUID(),
        importedAt: now,
        importedBy: actorId,
        importedResumeRecordId: recordId,
        organizationId,
        poolItemId: id,
      });
      await tx.insert(resumePoolEvent).values({
        actorId,
        id: crypto.randomUUID(),
        organizationId,
        payload: { resumeRecordId: recordId },
        poolItemId: id,
        type: "imported",
      });
    });
    await this.queueProducer
      .enqueueResumeSemanticIndexJobs([
        { organizationId, sourceId: recordId, sourceType: "studio_interview" },
      ])
      .catch((error) =>
        console.error("[resume-pool] imported semantic enqueue failed", { error, recordId }),
      );
    if (isResumeParseQueueConfigured(rawBackendEnvironment)) {
      await this.queueProducer
        .enqueueResumeReviewGenerationJobs([
          { organizationId, resumeRecordId: recordId, source: "resume_pool_import_questions" },
        ])
        .catch((error) =>
          console.error("[resume-pool] imported questions enqueue failed", { error, recordId }),
        );
      if (input.jobDescriptionId) {
        await this.queueProducer
          .enqueueResumeReviewGenerationJobs([
            {
              jobDescriptionId: input.jobDescriptionId,
              organizationId,
              poolItemId: id,
              resumeRecordId: recordId,
              runId: crypto.randomUUID(),
              source: "resume_pool_import",
            },
          ])
          .catch((error) =>
            console.error("[resume-pool] imported review enqueue failed", { error, recordId }),
          );
      }
    }
    return { resumeRecordId: recordId, status: "imported" as const };
  }

  async getJobMatch(organizationId: string, actorId: string, id: string) {
    await this.get(organizationId, actorId, id, null);
    const runs = await this.database
      .select()
      .from(resumeJobMatchRun)
      .where(
        and(
          eq(resumeJobMatchRun.organizationId, organizationId),
          eq(resumeJobMatchRun.poolItemId, id),
        ),
      )
      .orderBy(desc(resumeJobMatchRun.createdAt))
      .limit(1);
    const run = runs[0];
    if (!run) {
      return null;
    }
    const candidates = await this.database
      .select({
        aiRank: resumeJobMatchCandidate.aiRank,
        aiReason: resumeJobMatchCandidate.aiReason,
        aiScore: resumeJobMatchCandidate.aiScore,
        availableOrg: jobDescription.organizationId,
        availableStatus: jobDescription.lifecycleStatus,
        jobDescriptionId: resumeJobMatchCandidate.jobDescriptionId,
        jobSnapshot: resumeJobMatchCandidate.jobSnapshot,
        recallRank: resumeJobMatchCandidate.recallRank,
        vectorScore: resumeJobMatchCandidate.vectorScore,
      })
      .from(resumeJobMatchCandidate)
      .leftJoin(jobDescription, eq(jobDescription.id, resumeJobMatchCandidate.jobDescriptionId))
      .where(eq(resumeJobMatchCandidate.runId, run.id))
      .orderBy(
        sql`${resumeJobMatchCandidate.aiRank} asc nulls last`,
        sql`${resumeJobMatchCandidate.recallRank} asc nulls last`,
      );
    return {
      candidates: candidates.map((item) => ({
        aiRank: item.aiRank,
        aiReason: item.aiReason,
        aiScore: item.aiScore,
        available: item.availableStatus === "published" && item.availableOrg === organizationId,
        code: item.jobSnapshot.code,
        departmentName: item.jobSnapshot.departmentName,
        id: item.jobDescriptionId ?? item.jobSnapshot.id,
        isCurrent: run.selectedJobDescriptionId === (item.jobDescriptionId ?? item.jobSnapshot.id),
        name: item.jobSnapshot.name,
        recallRank: item.recallRank,
        vectorScore: item.vectorScore,
      })),
      createdAt: run.createdAt.toISOString(),
      id: run.id,
      selectedJobDescriptionId: run.selectedJobDescriptionId,
      selectionMethod: run.selectionMethod,
      status: run.status,
    };
  }

  async recommendations(organizationId: string, actorId: string, id: string, topN: number) {
    const item = await this.get(organizationId, actorId, id, null);
    return recommendJobsForPoolResume(this.database, {
      id,
      jobDescriptionId: item.jobDescriptionId,
      organizationId,
      profile: item.resumeProfile ?? null,
      topN,
    });
  }
}
