// Qwen3.5 OCR via DashScope's OpenAI-compatible APIs.
// PDFs use Responses document parsing; images use Chat Completions vision input.

import OpenAI from "openai";
import { getRequiredEnv } from "./env";

const OCR_PROMPT =
  "请完整提取这张简历图片中的所有文字，包括所有图片、图表、表格中的文字。保持原始排版顺序，表格用文字形式还原。只输出提取的文字，不要解释。";
const QWEN_BASE64_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

let cachedClient: OpenAI | null = null;

function getQwenOcrModel(): string {
  const model = getRequiredEnv("QWEN_OCR_MODEL");
  if (model !== "qwen3.5-ocr") {
    throw new Error('QWEN_OCR_MODEL must be configured as "qwen3.5-ocr".');
  }
  return model;
}

function getClient(): OpenAI {
  if (cachedClient) {
    return cachedClient;
  }
  const apiKey = process.env.ALIBABA_API_KEY;
  if (!apiKey) {
    throw new Error("ALIBABA_API_KEY is not configured; cannot run Qwen OCR.");
  }
  cachedClient = new OpenAI({
    apiKey,
    baseURL: getRequiredEnv("QWEN_OCR_BASE_URL"),
  });
  return cachedClient;
}

export function isQwenOcrConfigured(): boolean {
  return Boolean(
    process.env.ALIBABA_API_KEY &&
    process.env.QWEN_OCR_BASE_URL &&
    process.env.QWEN_OCR_MODEL === "qwen3.5-ocr",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getQwenOcrResult(response: unknown): string {
  if (!isRecord(response) || !Array.isArray(response.output)) {
    throw new Error("Qwen3.5 OCR returned an invalid Responses payload.");
  }
  const [firstOutput] = response.output;
  if (!isRecord(firstOutput) || !Array.isArray(firstOutput.content)) {
    throw new Error("Qwen3.5 OCR response did not contain document content.");
  }
  const [firstContent] = firstOutput.content;
  if (!isRecord(firstContent)) {
    throw new Error("Qwen3.5 OCR response did not contain an OCR result.");
  }
  const ocrResult = firstContent.ocr_result;
  if (typeof ocrResult === "string") {
    return ocrResult;
  }
  if (ocrResult !== undefined) {
    return JSON.stringify(ocrResult);
  }
  throw new Error("Qwen3.5 OCR response did not contain an OCR result.");
}

type QwenPdfResponseParams = OpenAI.Responses.ResponseCreateParamsNonStreaming & {
  ocr_options: { task: "document_parsing" };
};

export async function qwenPdfOcr(fileUrl: string): Promise<string> {
  const client = getClient();
  const request: QwenPdfResponseParams = {
    input: [
      {
        content: [{ file_url: fileUrl, type: "input_file" }],
        role: "user",
        type: "message",
      },
    ],
    model: getQwenOcrModel(),
    ocr_options: { task: "document_parsing" },
  };
  const response = await client.responses.create(request);
  return getQwenOcrResult(response);
}

export async function qwenVlOcr(imageBytes: Buffer, mediaType = "image/png"): Promise<string> {
  const client = getClient();
  const base64 = imageBytes.toString("base64");
  const imageUrl = `data:${mediaType};base64,${base64}`;
  if (Buffer.byteLength(imageUrl) > QWEN_BASE64_IMAGE_MAX_BYTES) {
    throw new Error("Qwen3.5 OCR 的 Base64 图片输入不能超过 10 MB，请压缩图片后重试。");
  }
  const response = await client.chat.completions.create({
    max_tokens: 4096,
    messages: [
      {
        content: [
          { image_url: { url: imageUrl }, type: "image_url" },
          { text: OCR_PROMPT, type: "text" },
        ],
        role: "user",
      },
    ],
    model: getQwenOcrModel(),
    temperature: 0,
  });
  return response.choices[0]?.message?.content ?? "";
}
