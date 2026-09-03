import { createHash } from "node:crypto";
import type { InterviewQuestionTemplateSnapshot } from "@app/db-schema/interview-question-templates";
import { jsonValueSchema, stableStringify } from "./stable-stringify";

export function hashTemplateSnapshot(snapshot: InterviewQuestionTemplateSnapshot): string {
  const { templateId: _templateId, ...rest } = snapshot;
  return createHash("sha256")
    .update(stableStringify(jsonValueSchema.parse(rest)))
    .digest("hex");
}

export function hashTemplateSourceSnapshot(snapshot: InterviewQuestionTemplateSnapshot): string {
  const { templateId: _templateId, ...rest } = snapshot;
  const sourceSnapshot = {
    ...rest,
    questions: rest.questions.map(
      ({ followUpContract: _followUpContract, ...question }) => question,
    ),
  };
  return createHash("sha256")
    .update(stableStringify(jsonValueSchema.parse(sourceSnapshot)))
    .digest("hex");
}
