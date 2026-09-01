import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type {
  CandidateFormTemplateInput,
  CandidateFormScope,
} from "@arc/db-schema/candidate-forms";
import {
  candidateFormSubmission,
  candidateFormTemplate,
  candidateFormTemplateJobDescription,
  candidateFormTemplateQuestion,
  candidateFormTemplateVersion,
  jobDescription,
  studioInterview,
} from "@arc/db-schema/schema";
import { parseListTextFilters } from "@arc/shared/list-text-filters";
import type { z } from "zod";
import { WORKSPACE_DATABASE_PORT } from "../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";
import { CANDIDATE_SETUP_REFRESH_COMMANDS } from "../../candidate-lifecycle/public.js";
import type { CandidateSetupRefreshCommands } from "../../candidate-lifecycle/public.js";
import type {
  candidateFormAiGenerateInputSchema,
  candidateFormCandidateSearchQuerySchema,
  candidateFormListQuerySchema,
} from "./candidate-form.schemas.js";
import { generateCandidateFormQuestions } from "./ai-question-generation.js";
import { resolveCandidateFormRefreshVersion } from "./refresh-eligible-candidates.js";

type ListQuery = z.infer<typeof candidateFormListQuerySchema>;
type CandidateSearchQuery = z.infer<typeof candidateFormCandidateSearchQuerySchema>;
type AiGenerateInput = z.infer<typeof candidateFormAiGenerateInputSchema>;
type TemplateRow = typeof candidateFormTemplate.$inferSelect;

function splitCsv(value?: string): string[] {
  return (
    value
      ?.split(",")
      .map((part) => part.trim())
      .filter(Boolean) ?? []
  );
}

function serializeBase(row: TemplateRow) {
  return {
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    scope: row.scope,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class CandidateFormService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(CANDIDATE_SETUP_REFRESH_COMMANDS)
    private readonly candidateRefresh: CandidateSetupRefreshCommands,
  ) {}

  async aiGenerateQuestions(organizationId: string, input: AiGenerateInput) {
    return {
      questions: await generateCandidateFormQuestions(this.database, organizationId, input),
    };
  }

  async refreshEligibleCandidates(organizationId: string, operatorId: string, templateId: string) {
    try {
      const version = await resolveCandidateFormRefreshVersion(this.database, {
        organizationId,
        templateId,
      });
      const result = await this.candidateRefresh.refreshCandidateForms({
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
        throw new NotFoundException("面试表单不存在或已归档。", {
          errorCode: "CANDIDATE_FORM_NOT_FOUND",
        });
      }
      throw error;
    }
  }

  async candidateSearch(organizationId: string, query: CandidateSearchQuery) {
    const where = query.search
      ? and(
          eq(studioInterview.organizationId, organizationId),
          or(
            ilike(studioInterview.candidateName, `%${query.search}%`),
            ilike(studioInterview.candidateEmail, `%${query.search}%`),
          ),
        )
      : eq(studioInterview.organizationId, organizationId);
    const rows = await this.database
      .select({
        candidateName: studioInterview.candidateName,
        id: studioInterview.id,
        jobDescriptionId: studioInterview.jobDescriptionId,
        jobDescriptionName: jobDescription.name,
      })
      .from(studioInterview)
      .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
      .where(where)
      .orderBy(desc(studioInterview.createdAt))
      .limit(query.limit);
    const submitted =
      query.templateId && rows.length
        ? await this.database
            .select({ id: candidateFormSubmission.interviewRecordId })
            .from(candidateFormSubmission)
            .where(
              and(
                eq(candidateFormSubmission.templateId, query.templateId),
                inArray(
                  candidateFormSubmission.interviewRecordId,
                  rows.map((row) => row.id),
                ),
              ),
            )
        : [];
    const submittedIds = new Set(submitted.map((row) => row.id));
    return { records: rows.map((row) => ({ ...row, hasSubmission: submittedIds.has(row.id) })) };
  }

  private async assertJobDescriptions(organizationId: string, ids: string[]) {
    if (ids.length === 0) {
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
        errorCode: "CANDIDATE_FORM_JOB_DESCRIPTION_INVALID",
      });
    }
  }

  private questionValues(input: CandidateFormTemplateInput, templateId: string, now: Date) {
    return input.questions.map((question) => ({
      createdAt: now,
      displayMode: question.displayMode,
      helperText: question.helperText?.trim() || null,
      id: question.id?.trim() || crypto.randomUUID(),
      label: question.label.trim(),
      options: question.type === "text" ? [] : question.options,
      required: question.required,
      sortOrder: question.sortOrder,
      templateId,
      type: question.type,
      updatedAt: now,
    }));
  }

  private async relations(templateIds: string[]) {
    if (templateIds.length === 0) {
      return {
        jobDescriptions: new Map<string, { id: string; name: string }[]>(),
        questionCounts: new Map<string, number>(),
        submissionCounts: new Map<string, number>(),
      };
    }
    const [jobRows, questionRows, submissionRows] = await Promise.all([
      this.database
        .select({
          id: jobDescription.id,
          name: jobDescription.name,
          templateId: candidateFormTemplateJobDescription.templateId,
        })
        .from(candidateFormTemplateJobDescription)
        .innerJoin(
          jobDescription,
          eq(candidateFormTemplateJobDescription.jobDescriptionId, jobDescription.id),
        )
        .where(inArray(candidateFormTemplateJobDescription.templateId, templateIds))
        .orderBy(asc(jobDescription.name)),
      this.database
        .select({ count: count(), templateId: candidateFormTemplateQuestion.templateId })
        .from(candidateFormTemplateQuestion)
        .where(inArray(candidateFormTemplateQuestion.templateId, templateIds))
        .groupBy(candidateFormTemplateQuestion.templateId),
      this.database
        .select({ count: count(), templateId: candidateFormSubmission.templateId })
        .from(candidateFormSubmission)
        .where(inArray(candidateFormSubmission.templateId, templateIds))
        .groupBy(candidateFormSubmission.templateId),
    ]);
    const jobDescriptions = new Map<string, { id: string; name: string }[]>();
    for (const row of jobRows) {
      const values = jobDescriptions.get(row.templateId) ?? [];
      values.push({ id: row.id, name: row.name });
      jobDescriptions.set(row.templateId, values);
    }
    return {
      jobDescriptions,
      questionCounts: new Map(questionRows.map((row) => [row.templateId, row.count])),
      submissionCounts: new Map(submissionRows.map((row) => [row.templateId, row.count])),
    };
  }

  private async toListRecords(rows: TemplateRow[]) {
    const related = await this.relations(rows.map((row) => row.id));
    return rows.map((row) => {
      const jobDescriptions = related.jobDescriptions.get(row.id) ?? [];
      return {
        ...serializeBase(row),
        jobDescriptionIds: jobDescriptions.map((job) => job.id),
        jobDescriptions,
        questionCount: related.questionCounts.get(row.id) ?? 0,
        submissionCount: related.submissionCounts.get(row.id) ?? 0,
      };
    });
  }

  async list(organizationId: string, query: ListQuery) {
    const textFilters = parseListTextFilters(query.textFilters);
    const filters = [eq(candidateFormTemplate.organizationId, organizationId)];
    if (query.archived === "active") {
      filters.push(isNull(candidateFormTemplate.archivedAt));
    }
    if (query.archived === "archived") {
      filters.push(isNotNull(candidateFormTemplate.archivedAt));
    }
    if (query.search) {
      const searchFilter = or(
        ilike(candidateFormTemplate.title, `%${query.search}%`),
        ilike(candidateFormTemplate.description, `%${query.search}%`),
      );
      if (searchFilter) {
        filters.push(searchFilter);
      }
    }
    if (textFilters.title) {
      filters.push(ilike(candidateFormTemplate.title, `%${textFilters.title}%`));
    }
    if (textFilters.description) {
      filters.push(ilike(candidateFormTemplate.description, `%${textFilters.description}%`));
    }
    const scopes = splitCsv(query.scope).filter(
      (scope): scope is CandidateFormScope => scope === "global" || scope === "job_description",
    );
    if (scopes.length) {
      filters.push(inArray(candidateFormTemplate.scope, scopes));
    }
    const requestedJobs = splitCsv(query.jobDescriptionId);
    if (requestedJobs.length) {
      const links = await this.database
        .select({ templateId: candidateFormTemplateJobDescription.templateId })
        .from(candidateFormTemplateJobDescription)
        .where(inArray(candidateFormTemplateJobDescription.jobDescriptionId, requestedJobs));
      const templateIds = [...new Set(links.map((row) => row.templateId))];
      if (templateIds.length === 0) {
        return { page: query.page, pageSize: query.pageSize, records: [], total: 0, totalPages: 0 };
      }
      filters.push(inArray(candidateFormTemplate.id, templateIds));
    }
    const where = and(...filters);
    let order =
      query.sortOrder === "asc"
        ? asc(candidateFormTemplate.createdAt)
        : desc(candidateFormTemplate.createdAt);
    if (query.sortBy === "title") {
      order =
        query.sortOrder === "asc"
          ? asc(candidateFormTemplate.title)
          : desc(candidateFormTemplate.title);
    } else if (query.sortBy === "updatedAt") {
      order =
        query.sortOrder === "asc"
          ? asc(candidateFormTemplate.updatedAt)
          : desc(candidateFormTemplate.updatedAt);
    }
    const [rows, totalRows] = await Promise.all([
      this.database
        .select()
        .from(candidateFormTemplate)
        .where(where)
        .orderBy(order, desc(candidateFormTemplate.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.select({ count: count() }).from(candidateFormTemplate).where(where),
    ]);
    const total = totalRows[0]?.count ?? 0;
    return {
      page: query.page,
      pageSize: query.pageSize,
      records: await this.toListRecords(rows),
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  async listAll(organizationId: string) {
    const rows = await this.database
      .select()
      .from(candidateFormTemplate)
      .where(
        and(
          eq(candidateFormTemplate.organizationId, organizationId),
          isNull(candidateFormTemplate.archivedAt),
        ),
      )
      .orderBy(asc(candidateFormTemplate.title));
    return { records: await this.toListRecords(rows) };
  }

  async get(organizationId: string, id: string) {
    const rows = await this.database
      .select()
      .from(candidateFormTemplate)
      .where(
        and(
          eq(candidateFormTemplate.id, id),
          eq(candidateFormTemplate.organizationId, organizationId),
        ),
      )
      .limit(1);
    const [row] = rows;
    if (!row) {
      throw new NotFoundException("面试表单不存在。", { errorCode: "CANDIDATE_FORM_NOT_FOUND" });
    }
    const [questions, related] = await Promise.all([
      this.database
        .select()
        .from(candidateFormTemplateQuestion)
        .where(eq(candidateFormTemplateQuestion.templateId, id))
        .orderBy(asc(candidateFormTemplateQuestion.sortOrder)),
      this.relations([id]),
    ]);
    const jobDescriptions = related.jobDescriptions.get(id) ?? [];
    return {
      ...serializeBase(row),
      jobDescriptionIds: jobDescriptions.map((job) => job.id),
      jobDescriptions,
      questions: questions.map((question) => ({
        ...question,
        createdAt: question.createdAt.toISOString(),
        updatedAt: question.updatedAt.toISOString(),
      })),
    };
  }

  async create(organizationId: string, actorId: string, input: CandidateFormTemplateInput) {
    const jobDescriptionIds = input.scope === "job_description" ? input.jobDescriptionIds : [];
    await this.assertJobDescriptions(organizationId, jobDescriptionIds);
    const now = new Date();
    const id = crypto.randomUUID();
    await this.database.transaction(async (transaction) => {
      await transaction.insert(candidateFormTemplate).values({
        createdAt: now,
        createdBy: actorId,
        description: input.description?.trim() || null,
        id,
        organizationId,
        scope: input.scope,
        title: input.title.trim(),
        updatedAt: now,
      });
      await transaction
        .insert(candidateFormTemplateQuestion)
        .values(this.questionValues(input, id, now));
      if (jobDescriptionIds.length) {
        await transaction
          .insert(candidateFormTemplateJobDescription)
          .values(
            jobDescriptionIds.map((jobDescriptionId) => ({ jobDescriptionId, templateId: id })),
          );
      }
    });
    return this.get(organizationId, id);
  }

  async update(organizationId: string, id: string, input: CandidateFormTemplateInput) {
    await this.get(organizationId, id);
    const jobDescriptionIds = input.scope === "job_description" ? input.jobDescriptionIds : [];
    await this.assertJobDescriptions(organizationId, jobDescriptionIds);
    const now = new Date();
    await this.database.transaction(async (transaction) => {
      await transaction
        .update(candidateFormTemplate)
        .set({
          description: input.description?.trim() || null,
          scope: input.scope,
          title: input.title.trim(),
          updatedAt: now,
        })
        .where(
          and(
            eq(candidateFormTemplate.id, id),
            eq(candidateFormTemplate.organizationId, organizationId),
          ),
        );
      await transaction
        .delete(candidateFormTemplateQuestion)
        .where(eq(candidateFormTemplateQuestion.templateId, id));
      await transaction
        .insert(candidateFormTemplateQuestion)
        .values(this.questionValues(input, id, now));
      await transaction
        .delete(candidateFormTemplateJobDescription)
        .where(eq(candidateFormTemplateJobDescription.templateId, id));
      if (jobDescriptionIds.length) {
        await transaction
          .insert(candidateFormTemplateJobDescription)
          .values(
            jobDescriptionIds.map((jobDescriptionId) => ({ jobDescriptionId, templateId: id })),
          );
      }
    });
    return this.get(organizationId, id);
  }

  async archive(organizationId: string, id: string) {
    const existing = await this.get(organizationId, id);
    if (existing.archivedAt) {
      throw new BadRequestException("该表单已归档。", {
        errorCode: "CANDIDATE_FORM_ALREADY_ARCHIVED",
      });
    }
    await this.database
      .update(candidateFormTemplate)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(candidateFormTemplate.id, id),
          eq(candidateFormTemplate.organizationId, organizationId),
        ),
      );
    return { success: true } as const;
  }

  async unarchive(organizationId: string, id: string) {
    const existing = await this.get(organizationId, id);
    if (!existing.archivedAt) {
      throw new BadRequestException("该表单未归档。", { errorCode: "CANDIDATE_FORM_NOT_ARCHIVED" });
    }
    await this.database
      .update(candidateFormTemplate)
      .set({ archivedAt: null })
      .where(
        and(
          eq(candidateFormTemplate.id, id),
          eq(candidateFormTemplate.organizationId, organizationId),
        ),
      );
    return { success: true } as const;
  }

  async submissions(
    organizationId: string,
    id: string,
    pagination: { limit: number; offset: number },
  ) {
    await this.get(organizationId, id);
    const [rows, countRows] = await Promise.all([
      this.database
        .select({
          answers: candidateFormSubmission.answers,
          candidateName: studioInterview.candidateName,
          id: candidateFormSubmission.id,
          interviewRecordId: candidateFormSubmission.interviewRecordId,
          snapshot: candidateFormTemplateVersion.snapshot,
          submittedAt: candidateFormSubmission.submittedAt,
          templateId: candidateFormSubmission.templateId,
          version: candidateFormTemplateVersion.version,
          versionId: candidateFormSubmission.versionId,
        })
        .from(candidateFormSubmission)
        .innerJoin(
          candidateFormTemplateVersion,
          eq(candidateFormSubmission.versionId, candidateFormTemplateVersion.id),
        )
        .leftJoin(
          studioInterview,
          eq(candidateFormSubmission.interviewRecordId, studioInterview.id),
        )
        .where(
          and(
            eq(candidateFormSubmission.templateId, id),
            eq(candidateFormSubmission.organizationId, organizationId),
          ),
        )
        .orderBy(desc(candidateFormSubmission.submittedAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      this.database
        .select({ count: count() })
        .from(candidateFormSubmission)
        .where(
          and(
            eq(candidateFormSubmission.templateId, id),
            eq(candidateFormSubmission.organizationId, organizationId),
          ),
        ),
    ]);
    return {
      submissions: rows.map((row) => ({ ...row, submittedAt: row.submittedAt.toISOString() })),
      total: countRows[0]?.count ?? 0,
    };
  }

  async version(organizationId: string, id: string, versionId: string) {
    await this.get(organizationId, id);
    const rows = await this.database
      .select()
      .from(candidateFormTemplateVersion)
      .where(
        and(
          eq(candidateFormTemplateVersion.id, versionId),
          eq(candidateFormTemplateVersion.templateId, id),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("版本不存在。", {
        errorCode: "CANDIDATE_FORM_VERSION_NOT_FOUND",
      });
    }
    return { ...rows[0], createdAt: rows[0].createdAt.toISOString() };
  }
}
