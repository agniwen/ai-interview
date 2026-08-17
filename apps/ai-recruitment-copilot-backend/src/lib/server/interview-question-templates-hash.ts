import { createHash } from "node:crypto";
import type { InterviewQuestionTemplateSnapshot } from "@arc/db-schema/interview-question-templates";
import { jsonValueSchema, stableStringify } from "./stable-stringify";

export function hashTemplateSnapshot(snapshot: InterviewQuestionTemplateSnapshot): string {
  const { templateId: _templateId, ...rest } = snapshot;
  return createHash("sha256")
    .update(stableStringify(jsonValueSchema.parse(rest)))
    .digest("hex");
}
