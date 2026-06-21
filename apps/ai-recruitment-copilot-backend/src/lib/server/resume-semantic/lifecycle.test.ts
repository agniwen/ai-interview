import { describe, expect, it, vi } from "vitest";
import { deleteResumeSemanticIndex } from "./lifecycle";

describe("deleteResumeSemanticIndex", () => {
  it("deletes vector embeddings and index state for a resume source", async () => {
    const deleteResumeEmbeddings = vi.fn();
    const deleteIndexState = vi.fn();

    await deleteResumeSemanticIndex(
      {
        sourceId: "resume-1",
        sourceType: "studio_interview",
      },
      {
        deleteIndexState,
        getEmbeddingVersion: () => "v1",
        vectorStore: {
          deleteResumeEmbeddings,
        },
      },
    );

    expect(deleteResumeEmbeddings).toHaveBeenCalledWith({
      embeddingVersion: "v1",
      sourceId: "resume-1",
      sourceType: "studio_interview",
    });
    expect(deleteIndexState).toHaveBeenCalledWith({
      embeddingVersion: "v1",
      sourceId: "resume-1",
      sourceType: "studio_interview",
    });
  });
});
