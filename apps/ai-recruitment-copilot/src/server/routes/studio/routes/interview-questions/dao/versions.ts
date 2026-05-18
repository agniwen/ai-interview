import type {
  InterviewQuestionTemplateSnapshot,
  InterviewQuestionTemplateVersionRecord,
} from "@/lib/shared/interview-question-templates";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import {
  interviewQuestionTemplate,
  interviewQuestionTemplateJobDescription,
  interviewQuestionTemplateQuestion,
  interviewQuestionTemplateVersion,
} from "@/lib/shared/db/schema";
import { buildTemplateSnapshot } from "@/lib/shared/interview-question-templates";
import { hashTemplateSnapshot } from "@/lib/server/interview-question-templates-hash";
import { mapQuestionRow, serializeDate } from "./queries";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function resolveOrCreateInterviewQuestionTemplateVersion(
  tx: Tx,
  templateId: string,
): Promise<InterviewQuestionTemplateVersionRecord> {
  const [templateRow] = await tx
    .select()
    .from(interviewQuestionTemplate)
    .where(eq(interviewQuestionTemplate.id, templateId))
    .limit(1);
  if (!templateRow) {
    throw new Error(`模板 ${templateId} 不存在`);
  }
  const questionRows = await tx
    .select()
    .from(interviewQuestionTemplateQuestion)
    .where(eq(interviewQuestionTemplateQuestion.templateId, templateId))
    .orderBy(asc(interviewQuestionTemplateQuestion.sortOrder));

  const linkRows = await tx
    .select({ jobDescriptionId: interviewQuestionTemplateJobDescription.jobDescriptionId })
    .from(interviewQuestionTemplateJobDescription)
    .where(eq(interviewQuestionTemplateJobDescription.templateId, templateId));
  const snapshot: InterviewQuestionTemplateSnapshot = buildTemplateSnapshot({
    description: templateRow.description,
    jobDescriptionIds: linkRows.map((row) => row.jobDescriptionId),
    questions: questionRows.map(mapQuestionRow),
    scope: templateRow.scope,
    templateId: templateRow.id,
    title: templateRow.title,
  });
  const contentHash = hashTemplateSnapshot(snapshot);

  const [existing] = await tx
    .select()
    .from(interviewQuestionTemplateVersion)
    .where(
      and(
        eq(interviewQuestionTemplateVersion.templateId, templateId),
        eq(interviewQuestionTemplateVersion.contentHash, contentHash),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      contentHash: existing.contentHash,
      createdAt: serializeDate(existing.createdAt),
      id: existing.id,
      snapshot: existing.snapshot,
      templateId: existing.templateId,
      version: existing.version,
    };
  }

  const [maxRow] = await tx
    .select({ maxVersion: interviewQuestionTemplateVersion.version })
    .from(interviewQuestionTemplateVersion)
    .where(eq(interviewQuestionTemplateVersion.templateId, templateId))
    .orderBy(desc(interviewQuestionTemplateVersion.version))
    .limit(1);
  const nextVersion = (maxRow?.maxVersion ?? 0) + 1;

  try {
    const [inserted] = await tx
      .insert(interviewQuestionTemplateVersion)
      .values({
        contentHash,
        createdAt: new Date(),
        id: crypto.randomUUID(),
        snapshot,
        templateId,
        version: nextVersion,
      })
      .returning();
    if (!inserted) {
      throw new Error("版本写入失败");
    }
    return {
      contentHash: inserted.contentHash,
      createdAt: serializeDate(inserted.createdAt),
      id: inserted.id,
      snapshot: inserted.snapshot,
      templateId: inserted.templateId,
      version: inserted.version,
    };
  } catch (error) {
    const [loser] = await tx
      .select()
      .from(interviewQuestionTemplateVersion)
      .where(
        and(
          eq(interviewQuestionTemplateVersion.templateId, templateId),
          eq(interviewQuestionTemplateVersion.contentHash, contentHash),
        ),
      )
      .limit(1);
    if (!loser) {
      throw error;
    }
    return {
      contentHash: loser.contentHash,
      createdAt: serializeDate(loser.createdAt),
      id: loser.id,
      snapshot: loser.snapshot,
      templateId: loser.templateId,
      version: loser.version,
    };
  }
}

export async function loadInterviewQuestionTemplateVersionById(
  templateId: string,
  versionId: string,
): Promise<InterviewQuestionTemplateVersionRecord | null> {
  const [row] = await db
    .select()
    .from(interviewQuestionTemplateVersion)
    .where(
      and(
        eq(interviewQuestionTemplateVersion.id, versionId),
        eq(interviewQuestionTemplateVersion.templateId, templateId),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    contentHash: row.contentHash,
    createdAt: serializeDate(row.createdAt),
    id: row.id,
    snapshot: row.snapshot,
    templateId: row.templateId,
    version: row.version,
  };
}
