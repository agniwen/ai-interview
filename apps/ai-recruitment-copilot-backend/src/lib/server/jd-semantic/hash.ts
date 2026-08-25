import { createHash } from "node:crypto";
import type { JobDescriptionSemanticInput } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/text-builders";

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replaceAll(/\s+/g, " ").trim();
}

export function hashJobDescriptionForSemanticIndex(jd: JobDescriptionSemanticInput): string {
  const canonical = {
    departmentName: cleanText(jd.departmentName),
    name: cleanText(jd.name),
    prompt: cleanText(jd.prompt),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
