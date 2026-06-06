import { createHash } from "node:crypto";
import type { InterviewQuestionTemplateSnapshot } from "@arc/db-schema/interview-question-templates";
import { stableStringify } from "./stable-stringify";

export function hashTemplateSnapshot(snapshot: InterviewQuestionTemplateSnapshot): string {
  const { templateId: _templateId, ...rest } = snapshot;
  return createHash("sha256").update(stableStringify(rest)).digest("hex");
}
