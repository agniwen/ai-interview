import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type {
  InterviewQuestionTemplateInput,
  InterviewQuestionTemplateScope,
} from "@arc/db-schema/interview-question-templates";
import {
  interviewQuestionTemplate,
  interviewQuestionTemplateBinding,
  interviewQuestionTemplateJobDescription,
  interviewQuestionTemplateQuestion,
  interviewQuestionTemplateVersion,
  jobDescription,
} from "@arc/db-schema/schema";
import { parseListTextFilters } from "@arc/shared/list-text-filters";
import type { z } from "zod";
import { WORKSPACE_DATABASE_PORT } from "../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";
import { CANDIDATE_SETUP_REFRESH_COMMANDS } from "../../candidate-lifecycle/public.js";
import type { CandidateSetupRefreshCommands } from "../../candidate-lifecycle/public.js";
import type {
  questionTemplateAiGenerateInputSchema,
  questionTemplateListQuerySchema,
} from "./question-template.schemas.js";
import { generateCommunicationQuestions } from "../forms/ai-question-generation.js";
import { resolveCommunicationQuestionRefreshVersion } from "./refresh-eligible-candidates.js";

type Query = z.infer<typeof questionTemplateListQuerySchema>;
type AiGenerateInput = z.infer<typeof questionTemplateAiGenerateInputSchema>;
type Row = typeof interviewQuestionTemplate.$inferSelect;
const csv = (value?: string) =>
  value
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean) ?? [];
const serialize = (row: Row) => ({
  ...row,
  archivedAt: row.archivedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

@Injectable()
export class QuestionTemplateService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(CANDIDATE_SETUP_REFRESH_COMMANDS)
    private readonly candidateRefresh: CandidateSetupRefreshCommands,
  ) {}

  async aiGenerateQuestions(organizationId: string, input: AiGenerateInput) {
    return {
      questions: await generateCommunicationQuestions(this.database, organizationId, input),
    };
  }

  async refreshEligibleCandidates(organizationId: string, operatorId: string, templateId: string) {
    try {
      const version = await resolveCommunicationQuestionRefreshVersion(this.database, {
        organizationId,
        templateId,
      });
      const result = await this.candidateRefresh.refreshCommunicationQuestions({
        operatorId,
        organizationId,
        version: {
          id: version.id,
          snapshot: version.snapshot,
          version: version.version,
        },
      });
      return { ...result, success: true as const };
    } catch (error) {
      if (error instanceof Error && error.message === "TEMPLATE_NOT_FOUND") {
        throw new NotFoundException("面试题不存在或已归档。", {
          errorCode: "QUESTION_TEMPLATE_NOT_FOUND",
        });
      }
      throw error;
    }
  }

  private async assertJobs(organizationId: string, ids: string[]) {
    if (!ids.length) {
      return;
    }
    const rows = await this.database
      .select({ id: jobDescription.id })
      .from(jobDescription)
      .where(
        and(eq(jobDescription.organizationId, organizationId), inArray(jobDescription.id, ids)),
      );
    if (new Set(rows.map((row) => row.id)).size !== new Set(ids).size) {
      throw new BadRequestException("所选在招岗位中存在无效项。", {
        errorCode: "QUESTION_TEMPLATE_JOB_DESCRIPTION_INVALID",
      });
    }
  }

  private values(input: InterviewQuestionTemplateInput, templateId: string, now: Date) {
    return input.questions.map((question) => ({
      content: question.content.trim(),
      createdAt: now,
      difficulty: question.difficulty,
      evaluationFocus: question.evaluationFocus?.trim() || null,
      followUpDirections: question.followUpDirections?.trim() || null,
      id: question.id?.trim() || crypto.randomUUID(),
      sortOrder: question.sortOrder,
      templateId,
      updatedAt: now,
    }));
  }

  private async relationMaps(ids: string[]) {
    if (!ids.length) {
      return {
        bindings: new Map<string, number>(),
        jobs: new Map<string, { id: string; name: string }[]>(),
        questions: new Map<string, number>(),
      };
    }
    const [jobRows, questionRows, bindingRows] = await Promise.all([
      this.database
        .select({
          id: jobDescription.id,
          name: jobDescription.name,
          templateId: interviewQuestionTemplateJobDescription.templateId,
        })
        .from(interviewQuestionTemplateJobDescription)
        .innerJoin(
          jobDescription,
          eq(interviewQuestionTemplateJobDescription.jobDescriptionId, jobDescription.id),
        )
        .where(inArray(interviewQuestionTemplateJobDescription.templateId, ids))
        .orderBy(asc(jobDescription.name)),
      this.database
        .select({ count: count(), templateId: interviewQuestionTemplateQuestion.templateId })
        .from(interviewQuestionTemplateQuestion)
        .where(inArray(interviewQuestionTemplateQuestion.templateId, ids))
        .groupBy(interviewQuestionTemplateQuestion.templateId),
      this.database
        .select({ count: count(), templateId: interviewQuestionTemplateBinding.templateId })
        .from(interviewQuestionTemplateBinding)
        .where(inArray(interviewQuestionTemplateBinding.templateId, ids))
        .groupBy(interviewQuestionTemplateBinding.templateId),
    ]);
    const jobs = new Map<string, { id: string; name: string }[]>();
    for (const row of jobRows) {
      const list = jobs.get(row.templateId) ?? [];
      list.push({ id: row.id, name: row.name });
      jobs.set(row.templateId, list);
    }
    return {
      bindings: new Map(bindingRows.map((row) => [row.templateId, row.count])),
      jobs,
      questions: new Map(questionRows.map((row) => [row.templateId, row.count])),
    };
  }

  private async listRecords(rows: Row[]) {
    const maps = await this.relationMaps(rows.map((row) => row.id));
    return rows.map((row) => {
      const jobs = maps.jobs.get(row.id) ?? [];
      return {
        ...serialize(row),
        bindingCount: maps.bindings.get(row.id) ?? 0,
        jobDescriptionIds: jobs.map((job) => job.id),
        jobDescriptions: jobs,
        questionCount: maps.questions.get(row.id) ?? 0,
      };
    });
  }

  async list(organizationId: string, query: Query) {
    const text = parseListTextFilters(query.textFilters);
    const filters = [eq(interviewQuestionTemplate.organizationId, organizationId)];
    if (query.archived === "active") {
      filters.push(isNull(interviewQuestionTemplate.archivedAt));
    }
    if (query.archived === "archived") {
      filters.push(isNotNull(interviewQuestionTemplate.archivedAt));
    }
    if (query.search) {
      const searchFilter = or(
        ilike(interviewQuestionTemplate.title, `%${query.search}%`),
        ilike(interviewQuestionTemplate.description, `%${query.search}%`),
      );
      if (searchFilter) {
        filters.push(searchFilter);
      }
    }
    if (text.title) {
      filters.push(ilike(interviewQuestionTemplate.title, `%${text.title}%`));
    }
    if (text.description) {
      filters.push(ilike(interviewQuestionTemplate.description, `%${text.description}%`));
    }
    const scopes = csv(query.scope).filter(
      (scope): scope is InterviewQuestionTemplateScope =>
        scope === "global" || scope === "job_description",
    );
    if (scopes.length) {
      filters.push(inArray(interviewQuestionTemplate.scope, scopes));
    }
    const jobs = csv(query.jobDescriptionId);
    if (jobs.length) {
      const links = await this.database
        .select({ templateId: interviewQuestionTemplateJobDescription.templateId })
        .from(interviewQuestionTemplateJobDescription)
        .where(inArray(interviewQuestionTemplateJobDescription.jobDescriptionId, jobs));
      const ids = [...new Set(links.map((row) => row.templateId))];
      if (!ids.length) {
        return { page: query.page, pageSize: query.pageSize, records: [], total: 0, totalPages: 0 };
      }
      filters.push(inArray(interviewQuestionTemplate.id, ids));
    }
    const where = and(...filters);
    let order =
      query.sortOrder === "asc"
        ? asc(interviewQuestionTemplate.createdAt)
        : desc(interviewQuestionTemplate.createdAt);
    if (query.sortBy === "title") {
      order =
        query.sortOrder === "asc"
          ? asc(interviewQuestionTemplate.title)
          : desc(interviewQuestionTemplate.title);
    } else if (query.sortBy === "updatedAt") {
      order =
        query.sortOrder === "asc"
          ? asc(interviewQuestionTemplate.updatedAt)
          : desc(interviewQuestionTemplate.updatedAt);
    }
    const [rows, totals] = await Promise.all([
      this.database
        .select()
        .from(interviewQuestionTemplate)
        .where(where)
        .orderBy(order, desc(interviewQuestionTemplate.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.select({ count: count() }).from(interviewQuestionTemplate).where(where),
    ]);
    const total = totals[0]?.count ?? 0;
    return {
      page: query.page,
      pageSize: query.pageSize,
      records: await this.listRecords(rows),
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }

  async listAll(organizationId: string) {
    const rows = await this.database
      .select()
      .from(interviewQuestionTemplate)
      .where(
        and(
          eq(interviewQuestionTemplate.organizationId, organizationId),
          isNull(interviewQuestionTemplate.archivedAt),
        ),
      )
      .orderBy(asc(interviewQuestionTemplate.title));
    return { records: await this.listRecords(rows) };
  }

  async get(organizationId: string, id: string) {
    const rows = await this.database
      .select()
      .from(interviewQuestionTemplate)
      .where(
        and(
          eq(interviewQuestionTemplate.id, id),
          eq(interviewQuestionTemplate.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("面试题不存在。", { errorCode: "QUESTION_TEMPLATE_NOT_FOUND" });
    }
    const [questions, maps] = await Promise.all([
      this.database
        .select()
        .from(interviewQuestionTemplateQuestion)
        .where(eq(interviewQuestionTemplateQuestion.templateId, id))
        .orderBy(asc(interviewQuestionTemplateQuestion.sortOrder)),
      this.relationMaps([id]),
    ]);
    const jobs = maps.jobs.get(id) ?? [];
    return {
      ...serialize(rows[0]),
      jobDescriptionIds: jobs.map((job) => job.id),
      jobDescriptions: jobs,
      questions: questions.map((question) => ({
        ...question,
        createdAt: question.createdAt.toISOString(),
        updatedAt: question.updatedAt.toISOString(),
      })),
    };
  }

  async create(organizationId: string, actorId: string, input: InterviewQuestionTemplateInput) {
    const jobs = input.scope === "job_description" ? input.jobDescriptionIds : [];
    await this.assertJobs(organizationId, jobs);
    const now = new Date();
    const id = crypto.randomUUID();
    await this.database.transaction(async (tx) => {
      await tx.insert(interviewQuestionTemplate).values({
        createdAt: now,
        createdBy: actorId,
        description: input.description?.trim() || null,
        id,
        organizationId,
        scope: input.scope,
        title: input.title.trim(),
        updatedAt: now,
      });
      await tx.insert(interviewQuestionTemplateQuestion).values(this.values(input, id, now));
      if (jobs.length) {
        await tx
          .insert(interviewQuestionTemplateJobDescription)
          .values(jobs.map((jobDescriptionId) => ({ jobDescriptionId, templateId: id })));
      }
    });
    return this.get(organizationId, id);
  }

  async update(organizationId: string, id: string, input: InterviewQuestionTemplateInput) {
    await this.get(organizationId, id);
    const jobs = input.scope === "job_description" ? input.jobDescriptionIds : [];
    await this.assertJobs(organizationId, jobs);
    const now = new Date();
    await this.database.transaction(async (tx) => {
      await tx
        .update(interviewQuestionTemplate)
        .set({
          description: input.description?.trim() || null,
          scope: input.scope,
          title: input.title.trim(),
          updatedAt: now,
        })
        .where(
          and(
            eq(interviewQuestionTemplate.id, id),
            eq(interviewQuestionTemplate.organizationId, organizationId),
          ),
        );
      await tx
        .delete(interviewQuestionTemplateQuestion)
        .where(eq(interviewQuestionTemplateQuestion.templateId, id));
      await tx.insert(interviewQuestionTemplateQuestion).values(this.values(input, id, now));
      await tx
        .delete(interviewQuestionTemplateJobDescription)
        .where(eq(interviewQuestionTemplateJobDescription.templateId, id));
      if (jobs.length) {
        await tx
          .insert(interviewQuestionTemplateJobDescription)
          .values(jobs.map((jobDescriptionId) => ({ jobDescriptionId, templateId: id })));
      }
    });
    return this.get(organizationId, id);
  }

  async archive(organizationId: string, id: string) {
    const row = await this.get(organizationId, id);
    if (row.archivedAt) {
      throw new BadRequestException("该面试题已归档。", {
        errorCode: "QUESTION_TEMPLATE_ALREADY_ARCHIVED",
      });
    }
    await this.database
      .update(interviewQuestionTemplate)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(interviewQuestionTemplate.id, id),
          eq(interviewQuestionTemplate.organizationId, organizationId),
        ),
      );
    return { success: true } as const;
  }
  async unarchive(organizationId: string, id: string) {
    const row = await this.get(organizationId, id);
    if (!row.archivedAt) {
      throw new BadRequestException("该面试题未归档。", {
        errorCode: "QUESTION_TEMPLATE_NOT_ARCHIVED",
      });
    }
    await this.database
      .update(interviewQuestionTemplate)
      .set({ archivedAt: null })
      .where(
        and(
          eq(interviewQuestionTemplate.id, id),
          eq(interviewQuestionTemplate.organizationId, organizationId),
        ),
      );
    return { success: true } as const;
  }

  async version(organizationId: string, id: string, versionId: string) {
    await this.get(organizationId, id);
    const rows = await this.database
      .select()
      .from(interviewQuestionTemplateVersion)
      .where(
        and(
          eq(interviewQuestionTemplateVersion.id, versionId),
          eq(interviewQuestionTemplateVersion.templateId, id),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("版本不存在。", {
        errorCode: "QUESTION_TEMPLATE_VERSION_NOT_FOUND",
      });
    }
    return { ...rows[0], createdAt: rows[0].createdAt.toISOString() };
  }
}
