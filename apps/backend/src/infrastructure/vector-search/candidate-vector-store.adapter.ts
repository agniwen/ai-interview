import { Injectable } from "@nestjs/common";
import { QdrantClient } from "@qdrant/js-client-rest";
import { rawBackendEnvironment } from "../../config/raw-backend-environment.js";
import type { CandidateVectorStore } from "../../domains/candidate-lifecycle/semantic-index/candidate-vector-store.port.js";

@Injectable()
export class CandidateVectorStoreAdapter implements CandidateVectorStore {
  private readonly environment = rawBackendEnvironment;

  async deleteJobDescription(
    organizationId: string,
    jobDescriptionId: string,
  ): Promise<"deleted" | "not_configured"> {
    const qdrantUrl = this.environment.QDRANT_URL?.trim();
    if (!qdrantUrl) {
      return "not_configured";
    }
    const client = new QdrantClient({
      apiKey: this.environment.QDRANT_API_KEY?.trim() || undefined,
      checkCompatibility: false,
      url: qdrantUrl,
    });
    await client.delete(this.environment.QDRANT_RESUME_COLLECTION?.trim() || "resume_semantic_v1", {
      filter: {
        must: [
          { key: "sourceType", match: { value: "job_description" } },
          { key: "sourceId", match: { value: jobDescriptionId } },
          { key: "organizationId", match: { value: organizationId } },
        ],
      },
      wait: true,
    });
    return "deleted";
  }
}
