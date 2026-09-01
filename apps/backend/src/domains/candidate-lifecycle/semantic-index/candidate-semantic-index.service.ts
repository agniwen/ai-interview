import { Inject, Injectable } from "@nestjs/common";
import { resumeSemanticIndex } from "@arc/db-schema/schema";
import { and, eq } from "drizzle-orm";
import { API_DATABASE } from "../../../infrastructure/database/database.tokens.js";
import type { Database } from "../../../infrastructure/database/database.tokens.js";
import type { CandidateSemanticIndexCommands } from "./candidate-semantic-index.commands.js";
import { CANDIDATE_VECTOR_STORE } from "./candidate-vector-store.port.js";
import type { CandidateVectorStore } from "./candidate-vector-store.port.js";

@Injectable()
export class CandidateSemanticIndexService implements CandidateSemanticIndexCommands {
  constructor(
    @Inject(API_DATABASE) private readonly database: Database,
    @Inject(CANDIDATE_VECTOR_STORE) private readonly vectorStore: CandidateVectorStore,
  ) {}

  async deleteJobDescription(organizationId: string, jobDescriptionId: string): Promise<void> {
    const semanticFilter = and(
      eq(resumeSemanticIndex.organizationId, organizationId),
      eq(resumeSemanticIndex.sourceId, jobDescriptionId),
      eq(resumeSemanticIndex.sourceType, "job_description"),
    );
    await this.database
      .update(resumeSemanticIndex)
      .set({
        errorMessage: "job description deleted; vector cleanup pending",
        profileHash: "stale",
        status: "stale",
        updatedAt: new Date(),
      })
      .where(semanticFilter);

    const result = await this.vectorStore.deleteJobDescription(organizationId, jobDescriptionId);
    if (result === "not_configured") {
      return;
    }
    await this.database
      .update(resumeSemanticIndex)
      .set({
        errorMessage: "job description deleted; vector cleanup completed",
        profileHash: "deleted",
        status: "deleted",
        updatedAt: new Date(),
      })
      .where(semanticFilter);
  }
}
