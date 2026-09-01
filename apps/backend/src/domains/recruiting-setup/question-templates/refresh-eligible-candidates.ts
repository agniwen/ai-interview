import { createHash } from "node:crypto";
import { buildTemplateSnapshot } from "@arc/db-schema/interview-question-templates";
import {
  interviewQuestionTemplate,
  interviewQuestionTemplateJobDescription,
  interviewQuestionTemplateQuestion,
  interviewQuestionTemplateVersion,
} from "@arc/db-schema/schema";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";

type Transaction = Parameters<Parameters<WorkspaceDatabasePort["transaction"]>[0]>[0];
const jsonValueSchema = z.json();
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
type JsonValue = z.infer<typeof jsonValueSchema>;

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const objectResult = jsonObjectSchema.safeParse(value);
  if (objectResult.success) {
    return `{${Object.entries(objectResult.data)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashSnapshot(snapshot: ReturnType<typeof buildTemplateSnapshot>) {
  return createHash("sha256")
    .update(canonicalJson(jsonValueSchema.parse(snapshot)))
    .digest("hex");
}

async function resolveVersion(
  transaction: Transaction,
  options: { organizationId: string; templateId: string },
) {
  const [template] = await transaction
    .select()
    .from(interviewQuestionTemplate)
    .where(
      and(
        eq(interviewQuestionTemplate.id, options.templateId),
        eq(interviewQuestionTemplate.organizationId, options.organizationId),
        isNull(interviewQuestionTemplate.archivedAt),
      ),
    )
    .limit(1);
  if (!template) {
    throw new Error("TEMPLATE_NOT_FOUND");
  }
  const [questions, links] = await Promise.all([
    transaction
      .select()
      .from(interviewQuestionTemplateQuestion)
      .where(eq(interviewQuestionTemplateQuestion.templateId, options.templateId))
      .orderBy(asc(interviewQuestionTemplateQuestion.sortOrder)),
    transaction
      .select({ jobDescriptionId: interviewQuestionTemplateJobDescription.jobDescriptionId })
      .from(interviewQuestionTemplateJobDescription)
      .where(eq(interviewQuestionTemplateJobDescription.templateId, options.templateId)),
  ]);
  const snapshot = buildTemplateSnapshot({
    description: template.description,
    jobDescriptionIds: links.map((link) => link.jobDescriptionId),
    questions,
    scope: template.scope,
    templateId: options.templateId,
    title: template.title,
  });
  const contentHash = hashSnapshot(snapshot);
  const [existing] = await transaction
    .select()
    .from(interviewQuestionTemplateVersion)
    .where(
      and(
        eq(interviewQuestionTemplateVersion.templateId, options.templateId),
        eq(interviewQuestionTemplateVersion.contentHash, contentHash),
      ),
    )
    .limit(1);
  if (existing) {
    return existing;
  }
  const [latest] = await transaction
    .select({ version: max(interviewQuestionTemplateVersion.version) })
    .from(interviewQuestionTemplateVersion)
    .where(eq(interviewQuestionTemplateVersion.templateId, options.templateId));
  try {
    const [created] = await transaction
      .insert(interviewQuestionTemplateVersion)
      .values({
        contentHash,
        createdAt: new Date(),
        id: crypto.randomUUID(),
        snapshot,
        templateId: options.templateId,
        version: (latest?.version ?? 0) + 1,
      })
      .returning();
    if (!created) {
      throw new Error("QUESTION_VERSION_INSERT_FAILED");
    }
    return created;
  } catch (error) {
    const [winner] = await transaction
      .select()
      .from(interviewQuestionTemplateVersion)
      .where(
        and(
          eq(interviewQuestionTemplateVersion.templateId, options.templateId),
          eq(interviewQuestionTemplateVersion.contentHash, contentHash),
        ),
      )
      .limit(1);
    if (!winner) {
      throw error;
    }
    return winner;
  }
}

export function resolveCommunicationQuestionRefreshVersion(
  database: WorkspaceDatabasePort,
  options: { organizationId: string; templateId: string },
) {
  return database.transaction((transaction) => resolveVersion(transaction, options));
}
