// Qwen-VL OCR via DashScope (OpenAI-compatible mode).
// Used as visual fallback for image-based PDF resumes.

import OpenAI from "openai";

const OCR_PROMPT =
  "请完整提取这张简历图片中的所有文字，包括所有图片、图表、表格中的文字。保持原始排版顺序，表格用文字形式还原。只输出提取的文字，不要解释。";

let cachedClient: OpenAI | null = null;

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
    baseURL:
      process.env.QWEN_OCR_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1",
  });
  return cachedClient;
}

export function isQwenOcrConfigured(): boolean {
  return Boolean(process.env.ALIBABA_API_KEY);
}

export async function qwenVlOcr(pngBytes: Buffer): Promise<string> {
  const client = getClient();
  const base64 = pngBytes.toString("base64");
  const response = await client.chat.completions.create({
    max_tokens: 4096,
    messages: [
      {
        content: [
          { image_url: { url: `data:image/png;base64,${base64}` }, type: "image_url" },
          { text: OCR_PROMPT, type: "text" },
        ],
        role: "user",
      },
    ],
    model: process.env.QWEN_OCR_MODEL?.trim() || "qwen-vl-ocr-latest",
    temperature: 0,
  });
  return response.choices[0]?.message?.content ?? "";
}
