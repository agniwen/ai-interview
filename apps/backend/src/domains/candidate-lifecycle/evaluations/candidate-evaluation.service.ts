import { Inject, Injectable } from "@nestjs/common";
import { resumeEvaluationFailure, studioInterview } from "@arc/db-schema/schema";
import { and, eq, inArray } from "drizzle-orm";
import { API_DATABASE } from "../../../infrastructure/database/database.tokens.js";
import type { Database } from "../../../infrastructure/database/database.tokens.js";
import { ApiDatabaseUnitOfWork } from "../../../infrastructure/database/api-database-unit-of-work.js";
import type { CandidateEvaluationCommands } from "./candidate-evaluation.commands.js";

@Injectable()
export class CandidateEvaluationService implements CandidateEvaluationCommands {
  constructor(
    @Inject(API_DATABASE) private readonly database: Database,
    @Inject(ApiDatabaseUnitOfWork) private readonly unitOfWork: ApiDatabaseUnitOfWork,
  ) {}

  invalidateInFlightForJob(organizationId: string, jobDescriptionId: string): Promise<number> {
    return this.unitOfWork.run(async () => {
      const transaction = this.unitOfWork.current();
      const records = await transaction
        .update(studioInterview)
        .set({
          resumeEvaluationAttemptMode: null,
          resumeReviewError: null,
          resumeReviewQueuedAt: null,
          resumeReviewStatus: "idle",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(studioInterview.organizationId, organizationId),
            eq(studioInterview.jobDescriptionId, jobDescriptionId),
            inArray(studioInterview.resumeReviewStatus, ["queued", "processing"]),
          ),
        )
        .returning({ id: studioInterview.id });
      if (records.length > 0) {
        await transaction.delete(resumeEvaluationFailure).where(
          and(
            eq(resumeEvaluationFailure.organizationId, organizationId),
            inArray(
              resumeEvaluationFailure.resumeRecordId,
              records.map(({ id }) => id),
            ),
          ),
        );
      }
      return records.length;
    });
  }
}
