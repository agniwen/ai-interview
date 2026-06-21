import type { ResumeEmbeddingChunk } from "./vector-store";
import type { ResumeSemanticTextChunk } from "./text-builders";

type FetchLike = typeof fetch;

interface EmbedResumeSemanticTextsInput {
  apiKey: string;
  baseUrl: string;
  chunks: ResumeSemanticTextChunk[];
  dimensions: number;
  fetchImpl?: FetchLike;
  model: string;
}

interface EmbeddingResponse {
  data?: { embedding?: unknown }[];
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/u, "");
}

function parseEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const parsed = value.filter((item): item is number => typeof item === "number");
  return parsed.length === value.length ? parsed : null;
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
  const body = (await response.json()) as EmbeddingResponse;
  if (!body.data || body.data.length !== chunks.length) {
    throw new Error("Embedding response length does not match input chunks.");
  }
  return body.data.map((item, index) => {
    const embedding = parseEmbedding(item.embedding);
    if (!embedding) {
      throw new Error(`Embedding response item ${index} is invalid.`);
    }
    const chunk = chunks[index];
    if (!chunk) {
      throw new Error(`Missing semantic chunk at index ${index}.`);
    }
    return {
      chunkType: chunk.chunkType,
      embedding,
      text: chunk.text,
    };
  });
}
