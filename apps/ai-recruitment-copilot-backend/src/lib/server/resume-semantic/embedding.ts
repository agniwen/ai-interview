import type { ResumeEmbeddingChunk } from "./vector-store";
import type { ResumeSemanticTextChunk } from "./text-builders";
import { z } from "zod";

type FetchLike = typeof fetch;

interface EmbedResumeSemanticTextsInput {
  apiKey: string;
  baseUrl: string;
  chunks: ResumeSemanticTextChunk[];
  dimensions: number;
  fetchImpl?: FetchLike;
  model: string;
}

const embeddingResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()) })),
});

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/u, "");
}

export function getResumeEmbeddingConfig() {
  return {
    apiKey: process.env.RESUME_EMBEDDING_API_KEY || process.env.ALIBABA_API_KEY || "",
    baseUrl:
      process.env.RESUME_EMBEDDING_BASE_URL ||
      process.env.ALIBABA_EMBEDDING_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    dimensions: Number.parseInt(process.env.RESUME_EMBEDDING_DIMENSIONS || "1024", 10),
    model: process.env.RESUME_EMBEDDING_MODEL || "text-embedding-v4",
  };
}

export function isResumeSemanticIndexEnabled(): boolean {
  const value = process.env.RESUME_SEMANTIC_INDEX_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export async function embedResumeSemanticTexts({
  apiKey,
  baseUrl,
  chunks,
  dimensions,
  fetchImpl = fetch,
  model,
}: EmbedResumeSemanticTextsInput): Promise<ResumeEmbeddingChunk[]> {
  if (!apiKey) {
    throw new Error("RESUME_EMBEDDING_API_KEY or ALIBABA_API_KEY is not configured.");
  }
  if (chunks.length === 0) {
    return [];
  }
  const response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}/embeddings`, {
    body: JSON.stringify({
      dimensions,
      input: chunks.map((chunk) => chunk.text),
      model,
    }),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Embedding request failed (${response.status}): ${body.slice(0, 500)}`);
  }
  const bodyResult = embeddingResponseSchema.safeParse(await response.json());
  if (!bodyResult.success) {
    throw new Error("Embedding response payload is invalid.");
  }
  if (bodyResult.data.data.length !== chunks.length) {
    throw new Error("Embedding response length does not match input chunks.");
  }
  return bodyResult.data.data.map((item, index) => {
    const chunk = chunks[index];
    if (!chunk) {
      throw new Error(`Missing semantic chunk at index ${index}.`);
    }
    return {
      chunkType: chunk.chunkType,
      embedding: item.embedding,
      text: chunk.text,
    };
  });
}
