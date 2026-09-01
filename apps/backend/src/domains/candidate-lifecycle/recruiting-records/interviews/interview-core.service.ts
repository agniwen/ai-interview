import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, eq, inArray } from "drizzle-orm";
import { studioInterview, studioInterviewSchedule } from "@arc/db-schema/schema";
import type { studioInterviewQuestionClientSchema } from "@arc/db-schema/studio-interviews";
import type { z } from "zod";
import { WORKSPACE_DATABASE_PORT } from "../../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../../infrastructure/workspace/workspace.ports.js";
import { RECRUITING_SCOPE_QUERIES } from "../../../identity-access/public.js";
import type { RecruitingScopeQueries } from "../../../identity-access/public.js";

@Injectable()
export class InterviewCoreService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(RECRUITING_SCOPE_QUERIES)
    private readonly recruitingScope: RecruitingScopeQueries,
  ) {}

  visibleCreatorIds(organizationId: string, actorId: string, memberRole: string) {
    return this.recruitingScope.visibleCreatorIds(organizationId, actorId, memberRole);
  }

  async summary(organizationId: string, actorId: string, memberRole: string) {
    const visible = await this.visibleCreatorIds(organizationId, actorId, memberRole);
    const rows = await this.database
      .select({ count: count(), status: studioInterviewSchedule.status })
      .from(studioInterviewSchedule)
      .where(
        and(
          eq(studioInterviewSchedule.organizationId, organizationId),
          visible ? inArray(studioInterviewSchedule.createdBy, visible) : undefined,
        ),
      )
      .groupBy(studioInterviewSchedule.status);
    const result = { completed: 0, inProgress: 0, interrupted: 0, pending: 0, total: 0 };
    for (const row of rows) {
      result.total += row.count;
      if (row.status === "completed") {
        result.completed = row.count;
      } else if (row.status === "in_progress") {
        result.inProgress = row.count;
      } else if (row.status === "interrupted") {
        result.interrupted = row.count;
      } else if (row.status === "pending") {
        result.pending = row.count;
      }
    }
    return result;
  }

  async updateInterviewQuestions(
    organizationId: string,
    actorId: string,
    memberRole: string,
    id: string,
    questions: z.infer<typeof studioInterviewQuestionClientSchema>[],
  ) {
    const visible = await this.visibleCreatorIds(organizationId, actorId, memberRole);
    const existing = await this.database
      .select({ id: studioInterview.id })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, id),
          eq(studioInterview.organizationId, organizationId),
          visible ? inArray(studioInterview.createdBy, visible) : undefined,
        ),
      )
      .limit(1);
    if (!existing[0]) {
      throw new NotFoundException("记录不存在。", {
        errorCode: "RESUME_RECORD_NOT_FOUND",
      });
    }
    const interviewQuestions = questions.map((question) => ({
      ...question,
      dimension: question.dimension ?? "business",
    }));
    await this.database
      .update(studioInterview)
      .set({ interviewQuestions, updatedAt: new Date() })
      .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, organizationId)));
    return { interviewQuestions };
  }
}
