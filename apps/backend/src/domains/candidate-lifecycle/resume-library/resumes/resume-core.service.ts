import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, asc, count, desc, eq, exists, gte, inArray, ne, sql } from "drizzle-orm";
import {
  studioInterview,
  studioInterviewSchedule,
  studioOrgSkill,
  user,
} from "@arc/db-schema/schema";
import { startOfBeijingDay } from "@arc/shared/beijing-calendar";
import { candidateOutcomeSchema, pipelineStageSchema } from "@arc/db-schema/studio-interviews";
import {
  WORKSPACE_DATABASE_PORT,
  WORKSPACE_DOCUMENT_PREVIEW_PORT,
  WORKSPACE_OBJECT_STORAGE_PORT,
  WORKSPACE_RESUME_SEMANTIC_PORT,
  WORKSPACE_RESUME_QUEUE_PORT,
} from "../../../../infrastructure/workspace/workspace.ports.js";
import type {
  WorkspaceDatabasePort,
  WorkspaceDocumentPreviewPort,
  WorkspaceObjectStoragePort,
  WorkspaceResumeSemanticPort,
  WorkspaceResumeQueuePort,
} from "../../../../infrastructure/workspace/workspace.ports.js";
import type { z } from "zod";
import type { dedupCheckInputSchema } from "./resume-core.schemas.js";

type DedupInput = z.infer<typeof dedupCheckInputSchema>;

@Injectable()
export class ResumeCoreService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(WORKSPACE_DOCUMENT_PREVIEW_PORT)
    private readonly preview: WorkspaceDocumentPreviewPort,
    @Inject(WORKSPACE_OBJECT_STORAGE_PORT) private readonly storage: WorkspaceObjectStoragePort,
    @Inject(WORKSPACE_RESUME_SEMANTIC_PORT) private readonly semantic: WorkspaceResumeSemanticPort,
    @Inject(WORKSPACE_RESUME_QUEUE_PORT) private readonly queue: WorkspaceResumeQueuePort,
  ) {}

  async findDuplicates(organizationId: string, input: DedupInput) {
    const matches = await this.semantic.findDuplicates({ organizationId, ...input });
    return { matches };
  }

  async listSkillSuggestions(organizationId: string, prefix: string | undefined, limit: number) {
    const normalizedPrefix = prefix?.trim().toLowerCase();
    const filters = [
      eq(studioOrgSkill.organizationId, organizationId),
      sql`${studioOrgSkill.candidateCount} > 0`,
    ];
    if (normalizedPrefix) {
      filters.push(sql`${studioOrgSkill.normalized} LIKE ${`${normalizedPrefix}%`}`);
    }
    const records = await this.database
      .select({ count: studioOrgSkill.candidateCount, skill: studioOrgSkill.display })
      .from(studioOrgSkill)
      .where(and(...filters))
      .orderBy(desc(studioOrgSkill.candidateCount), asc(studioOrgSkill.normalized))
      .limit(limit);
    return { records };
  }

  async getReviewResume(organizationId: string, id: string) {
    const rows = await this.database
      .select({
        resumeFileName: studioInterview.resumeFileName,
        resumeStorageKey: studioInterview.resumeStorageKey,
      })
      .from(studioInterview)
      .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, organizationId)))
      .limit(1);
    const [record] = rows;
    if (!record) {
      throw new NotFoundException("记录不存在。", { errorCode: "RESUME_RECORD_NOT_FOUND" });
    }
    if (!record.resumeStorageKey) {
      throw new NotFoundException("该候选人没有可预览的简历文件。", {
        errorCode: "RESUME_FILE_NOT_FOUND",
      });
    }
    const object = await this.storage.getStream(record.resumeStorageKey);
    if (!object) {
      throw new NotFoundException("简历文件已不可用。", { errorCode: "RESUME_FILE_UNAVAILABLE" });
    }
    return { ...object, filename: record.resumeFileName || "resume.pdf" };
  }

  async getWorkspaceResume(organizationId: string, id: string, visibleCreatorIds: string[] | null) {
    const rows = await this.database
      .select({
        resumeFileName: studioInterview.resumeFileName,
        resumeStorageKey: studioInterview.resumeStorageKey,
      })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, id),
          eq(studioInterview.organizationId, organizationId),
          visibleCreatorIds ? inArray(studioInterview.createdBy, visibleCreatorIds) : undefined,
        ),
      )
      .limit(1);
    const [record] = rows;
    if (!record) {
      throw new NotFoundException("记录不存在。", { errorCode: "RESUME_RECORD_NOT_FOUND" });
    }
    if (!record.resumeStorageKey) {
      throw new NotFoundException("该候选人没有可预览的简历文件。", {
        errorCode: "RESUME_FILE_NOT_FOUND",
      });
    }
    const object = await this.storage.getStream(record.resumeStorageKey);
    if (!object) {
      throw new NotFoundException("简历文件已不可用。", { errorCode: "RESUME_FILE_UNAVAILABLE" });
    }
    return { ...object, filename: record.resumeFileName || "resume.pdf" };
  }

  async getInterviewResume(
    organizationId: string,
    roundId: string,
    visibleCreatorIds: string[] | null,
  ) {
    const rows = await this.database
      .select({
        resumeFileName: studioInterview.resumeFileName,
        resumeStorageKey: studioInterview.resumeStorageKey,
      })
      .from(studioInterviewSchedule)
      .innerJoin(studioInterview, eq(studioInterview.id, studioInterviewSchedule.interviewRecordId))
      .where(
        and(
          eq(studioInterviewSchedule.id, roundId),
          eq(studioInterviewSchedule.organizationId, organizationId),
          visibleCreatorIds
            ? inArray(studioInterviewSchedule.createdBy, visibleCreatorIds)
            : undefined,
        ),
      )
      .limit(1);
    const [record] = rows;
    if (!record) {
      throw new NotFoundException("记录不存在。", { errorCode: "INTERVIEW_ROUND_NOT_FOUND" });
    }
    if (!record.resumeStorageKey) {
      throw new NotFoundException("该候选人没有可预览的简历文件。", {
        errorCode: "RESUME_FILE_NOT_FOUND",
      });
    }
    const object = await this.storage.getStream(record.resumeStorageKey);
    if (!object) {
      throw new NotFoundException("简历文件已不可用。", { errorCode: "RESUME_FILE_UNAVAILABLE" });
    }
    return { ...object, filename: record.resumeFileName || "resume.pdf" };
  }

  async getResumePreview(organizationId: string, id: string, visibleCreatorIds: string[] | null) {
    const rows = await this.database
      .select({ filename: studioInterview.resumeFileName, key: studioInterview.resumeStorageKey })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, id),
          eq(studioInterview.organizationId, organizationId),
          visibleCreatorIds ? inArray(studioInterview.createdBy, visibleCreatorIds) : undefined,
        ),
      )
      .limit(1);
    const [record] = rows;
    if (!record) {
      throw new NotFoundException("记录不存在。", { errorCode: "RESUME_RECORD_NOT_FOUND" });
    }
    if (!record.key) {
      throw new NotFoundException("该候选人没有可预览的简历文件。", {
        errorCode: "RESUME_FILE_NOT_FOUND",
      });
    }
    const object = await this.storage.getBytes(record.key);
    if (!object) {
      throw new NotFoundException("简历文件已不可用。", { errorCode: "RESUME_FILE_UNAVAILABLE" });
    }
    const filename = record.filename || "resume.pdf";
    const bytes = filename.toLowerCase().endsWith(".pptx")
      ? await this.preview.pptxToPdf({ bytes: object.bytes, filename })
      : object.bytes;
    return { bytes, filename: `${filename.replace(/\.[^.]+$/, "") || "resume"}.pdf` };
  }

  async getInterviewResumePreview(
    organizationId: string,
    roundId: string,
    visibleCreatorIds: string[] | null,
  ) {
    const rows = await this.database
      .select({ id: studioInterview.id })
      .from(studioInterviewSchedule)
      .innerJoin(studioInterview, eq(studioInterview.id, studioInterviewSchedule.interviewRecordId))
      .where(
        and(
          eq(studioInterviewSchedule.id, roundId),
          eq(studioInterviewSchedule.organizationId, organizationId),
          visibleCreatorIds
            ? inArray(studioInterviewSchedule.createdBy, visibleCreatorIds)
            : undefined,
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("记录不存在。", { errorCode: "INTERVIEW_ROUND_NOT_FOUND" });
    }
    return this.getResumePreview(organizationId, rows[0].id, visibleCreatorIds);
  }

  async getMetrics(
    organizationId: string,
    actorId: string | undefined,
    scope: "personal" | "team",
  ) {
    const createdBy = scope === "personal" ? actorId : undefined;
    const base = and(
      eq(studioInterview.organizationId, organizationId),
      createdBy ? eq(studioInterview.createdBy, createdBy) : undefined,
    );
    const hasRounds = exists(
      this.database
        .select({ one: studioInterviewSchedule.id })
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.interviewRecordId, studioInterview.id)),
    );
    const day = sql<string>`to_char(date_trunc('day', ${studioInterview.createdAt} AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD')`;
    const since = startOfBeijingDay(new Date(Date.now() - 364 * 86_400_000));
    const [pipelineRows, dailyRows, conversionRows] = await Promise.all([
      this.database
        .select({
          count: count(),
          outcome: studioInterview.outcome,
          stage: studioInterview.pipelineStage,
        })
        .from(studioInterview)
        .where(and(base, ne(studioInterview.outcome, "archived")))
        .groupBy(studioInterview.pipelineStage, studioInterview.outcome),
      this.database
        .select({
          count: count(),
          day,
          userId: studioInterview.createdBy,
          userImage: user.image,
          userName: user.name,
        })
        .from(studioInterview)
        .leftJoin(user, eq(user.id, studioInterview.createdBy))
        .where(and(base, gte(studioInterview.createdAt, since)))
        .groupBy(day, studioInterview.createdBy, user.image, user.name)
        .orderBy(day),
      this.database
        .select({
          withInterview: sql<number>`COUNT(*) FILTER (WHERE ${hasRounds})`.mapWith(Number),
          withoutInterview: sql<number>`COUNT(*) FILTER (WHERE NOT ${hasRounds})`.mapWith(Number),
        })
        .from(studioInterview)
        .where(and(base, ne(studioInterview.outcome, "archived"))),
    ]);
    const daily = new Map<
      string,
      {
        byUser: { count: number; userId: string; userImage: string | null; userName: string }[];
        count: number;
        day: string;
      }
    >();
    for (const row of dailyRows) {
      const item = daily.get(row.day) ?? { byUser: [], count: 0, day: row.day };
      item.count += row.count;
      item.byUser.push({
        count: row.count,
        userId: row.userId ?? "unknown",
        userImage: row.userImage,
        userName: row.userName?.trim() || "未知用户",
      });
      daily.set(row.day, item);
    }
    return {
      byPipeline: pipelineRows.map((row) => ({
        count: row.count,
        outcome: candidateOutcomeSchema.parse(row.outcome),
        stage: pipelineStageSchema.parse(row.stage),
      })),
      conversion: {
        withInterview: conversionRows[0]?.withInterview ?? 0,
        withoutInterview: conversionRows[0]?.withoutInterview ?? 0,
      },
      dailyAdded: [...daily.values()].map((row) => ({
        ...row,
        byUser: row.byUser.toSorted((a, b) => b.count - a.count),
      })),
    };
  }

  async retryParse(
    organizationId: string,
    actorId: string,
    id: string,
    visibleCreatorIds: string[] | null,
  ) {
    const rows = await this.database
      .select({ status: studioInterview.resumeParseStatus })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, id),
          eq(studioInterview.organizationId, organizationId),
          visibleCreatorIds ? inArray(studioInterview.createdBy, visibleCreatorIds) : undefined,
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("记录不存在。", { errorCode: "RESUME_RECORD_NOT_FOUND" });
    }
    if (rows[0].status !== "failed") {
      throw new ConflictException("只有解析失败的简历可以重新解析。", {
        errorCode: "RESUME_PARSE_NOT_FAILED",
      });
    }
    const result = await this.queue.retryParse({
      organizationId,
      requestedBy: actorId,
      resumeRecordId: id,
    });
    if (result === "queued") {
      return { status: "queued" } as const;
    }
    if (result === "queue_unavailable") {
      throw new ServiceUnavailableException("简历解析队列未配置 REDIS_URL。", {
        errorCode: "RESUME_QUEUE_UNAVAILABLE",
      });
    }
    if (result === "missing") {
      throw new NotFoundException("记录不存在。", { errorCode: "RESUME_RECORD_NOT_FOUND" });
    }
    throw new ConflictException("该简历当前不能重新解析，请刷新后重试。", {
      errorCode: "RESUME_PARSE_BUSY",
    });
  }

  async forceReparse(
    organizationId: string,
    actorId: string,
    memberRole: string,
    id: string,
    visibleCreatorIds: string[] | null,
  ) {
    if (memberRole !== "admin" && memberRole !== "owner") {
      throw new ForbiddenException("仅工作区管理员可强制重新解析。", {
        errorCode: "RESUME_FORCE_REPARSE_FORBIDDEN",
      });
    }
    const rows = await this.database
      .select({ storageKey: studioInterview.resumeStorageKey })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, id),
          eq(studioInterview.organizationId, organizationId),
          visibleCreatorIds ? inArray(studioInterview.createdBy, visibleCreatorIds) : undefined,
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("记录不存在。", { errorCode: "RESUME_RECORD_NOT_FOUND" });
    }
    if (!rows[0].storageKey) {
      throw new ConflictException("该记录没有可重新解析的简历文件。", {
        errorCode: "RESUME_FILE_NOT_FOUND",
      });
    }
    const result = await this.queue.forceReparse({
      organizationId,
      requestedBy: actorId,
      resumeRecordId: id,
    });
    if (result === "queued") {
      return { status: "queued" } as const;
    }
    if (result === "queue_unavailable") {
      throw new ServiceUnavailableException("简历解析队列未配置 REDIS_URL。", {
        errorCode: "RESUME_QUEUE_UNAVAILABLE",
      });
    }
    if (result === "no_file") {
      throw new ConflictException("该记录没有可重新解析的简历文件。", {
        errorCode: "RESUME_FILE_NOT_FOUND",
      });
    }
    if (result === "busy") {
      throw new ConflictException("该简历正在解析中，请稍后再试。", {
        errorCode: "RESUME_PARSE_BUSY",
      });
    }
    throw new NotFoundException("记录不存在。", { errorCode: "RESUME_RECORD_NOT_FOUND" });
  }
}
