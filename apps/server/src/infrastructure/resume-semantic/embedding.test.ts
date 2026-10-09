import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "@app/db-schema/json";
import { embedResumeSemanticTexts } from "./embedding";

function jsonResponse(body: JsonValue) {
  return Response.json(body, {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

describe("embedResumeSemanticTexts", () => {
  it("calls the OpenAI-compatible embeddings endpoint with model and dimensions", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
      }),
    );

    const result = await embedResumeSemanticTexts({
      apiKey: "key",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      chunks: [
        { chunkType: "resume_overview", text: "overview" },
        { chunkType: "work_project", text: "work" },
      ],
      dimensions: 1024,
      fetchImpl,
      model: "text-embedding-v4",
    });

    expect(result).toEqual([
      { chunkType: "resume_overview", embedding: [0.1, 0.2], text: "overview" },
      { chunkType: "work_project", embedding: [0.3, 0.4], text: "work" },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings",
      expect.objectContaining({
        body: JSON.stringify({
          dimensions: 1024,
          input: ["overview", "work"],
          model: "text-embedding-v4",
        }),
        method: "POST",
      }),
    );
  });
});
