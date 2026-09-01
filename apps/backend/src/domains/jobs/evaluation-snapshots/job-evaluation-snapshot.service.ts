import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, desc, eq, max } from "drizzle-orm";
import { jobDescription, jobDescriptionVersion } from "@arc/db-schema/schema";
import { API_DATABASE } from "../../../infrastructure/database/database.tokens.js";
import type { Database } from "../../../infrastructure/database/database.tokens.js";
import type {
  JobEvaluationSnapshot,
  JobEvaluationSnapshotCommands,
} from "./job-evaluation-snapshot.commands.js";

@Injectable()
export class JobEvaluationSnapshotService implements JobEvaluationSnapshotCommands {
  constructor(@Inject(API_DATABASE) private readonly database: Database) {}

  ensureCurrent(
    organizationId: string,
    jobDescriptionId: string,
  ): Promise<JobEvaluationSnapshot | null> {
    return this.database.transaction(async (transaction) => {
      const [job] = await transaction
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

      const [latest] = await transaction
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

      const [version] = await transaction
        .select({ value: max(jobDescriptionVersion.version) })
        .from(jobDescriptionVersion)
        .where(eq(jobDescriptionVersion.jobDescriptionId, job.id));
      const snapshot: JobEvaluationSnapshot = {
        id: randomUUID(),
        jobDescriptionId: job.id,
        jobDescriptionName: job.name,
        prompt: job.prompt,
      };
      await transaction.insert(jobDescriptionVersion).values({
        ...snapshot,
        organizationId,
        version: Number(version?.value ?? 0) + 1,
      });
      return snapshot;
    });
  }
}
