import type { JsonObject } from "@arc/db-schema/json";

export function transcriptContext(texts: string[]): JsonObject[] {
  return texts
    .filter((text) => text.trim())
    .slice(-5)
    .map((text) => ({
      content: [{ text: [...text].slice(-400).join(""), type: "input_text" }],
      role: "user",
    }));
}
