import { Module } from "@nestjs/common";
import { CANDIDATE_VECTOR_STORE } from "../../domains/candidate-lifecycle/semantic-index/candidate-vector-store.port.js";
import { CandidateVectorStoreAdapter } from "./candidate-vector-store.adapter.js";

@Module({
  exports: [CANDIDATE_VECTOR_STORE],
  providers: [{ provide: CANDIDATE_VECTOR_STORE, useClass: CandidateVectorStoreAdapter }],
})
export class VectorSearchInfrastructureModule {}
