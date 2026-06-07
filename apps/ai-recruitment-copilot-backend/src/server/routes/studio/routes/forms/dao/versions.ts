import type {
  CandidateFormTemplateSnapshot,
  CandidateFormTemplateVersionRecord,
} from "@arc/db-schema/candidate-forms";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  candidateFormTemplate,
  candidateFormTemplateJobDescription,
  candidateFormTemplateQuestion,
  candidateFormTemplateVersion,
} from "@arc/db-schema/schema";
import { buildTemplateSnapshot } from "@arc/db-schema/candidate-forms";
import { hashTemplateSnapshot } from "@arc/ai-recruitment-copilot-backend/lib/server/candidate-forms-hash";
import { serializeDate } from "@arc/ai-recruitment-copilot-backend/lib/server/db/serialize";
import { mapQuestionRow } from "./queries";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Compute the snapshot for the template's current state and return a matching
 * version (creating a new one if no hash match exists).
 *
 * Must be called inside a transaction. The `(templateId, contentHash)` unique
 * index guarantees that concurrent callers converge on the same version row
 * even if they both try to insert.
 */
export async function resolveOrCreateTemplateVersion(
  tx: Tx,
  templateId: string,
): Promise<CandidateFormTemplateVersionRecord> {
  const [templateRow] = await tx
    .select()
    .from(candidateFormTemplate)
    .where(eq(candidateFormTemplate.id, templateId))
    .limit(1);
  if (!templateRow) {
    throw new Error(`模版 ${templateId} 不存在`);
  }
  const [questionRows, linkRows] = await Promise.all([
    tx
      .select()
      .from(candidateFormTemplateQuestion)
      .where(eq(candidateFormTemplateQuestion.templateId, templateId))
      .orderBy(asc(candidateFormTemplateQuestion.sortOrder)),
    tx
      .select({ jobDescriptionId: candidateFormTemplateJobDescription.jobDescriptionId })
      .from(candidateFormTemplateJobDescription)
      .where(eq(candidateFormTemplateJobDescription.templateId, templateId)),
  ]);

  const snapshot: CandidateFormTemplateSnapshot = buildTemplateSnapshot({
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
    .from(candidateFormTemplateVersion)
    .where(
      and(
        eq(candidateFormTemplateVersion.templateId, templateId),
        eq(candidateFormTemplateVersion.contentHash, contentHash),
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
    .select({ maxVersion: candidateFormTemplateVersion.version })
    .from(candidateFormTemplateVersion)
    .where(eq(candidateFormTemplateVersion.templateId, templateId))
    .orderBy(desc(candidateFormTemplateVersion.version))
    .limit(1);
  const nextVersion = (maxRow?.maxVersion ?? 0) + 1;

  try {
    const [inserted] = await tx
      .insert(candidateFormTemplateVersion)
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
    // Lost the race to another concurrent submitter — re-read by hash.
    const [loser] = await tx
      .select()
      .from(candidateFormTemplateVersion)
      .where(
        and(
          eq(candidateFormTemplateVersion.templateId, templateId),
          eq(candidateFormTemplateVersion.contentHash, contentHash),
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

export async function loadCandidateFormTemplateVersionById(
  templateId: string,
  versionId: string,
): Promise<CandidateFormTemplateVersionRecord | null> {
  const [row] = await db
    .select()
    .from(candidateFormTemplateVersion)
    .where(
      and(
        eq(candidateFormTemplateVersion.id, versionId),
        eq(candidateFormTemplateVersion.templateId, templateId),
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
