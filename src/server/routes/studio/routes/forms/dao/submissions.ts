import type {
  CandidateFormSubmissionRecord,
  CandidateFormSubmissionWithSnapshot,
  CandidateFormTemplateSnapshot,
} from "@/lib/shared/candidate-forms";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/server/db";
import {
  candidateFormSubmission,
  candidateFormTemplateVersion,
  studioInterview,
} from "@/lib/shared/db/schema";
import { serializeDate } from "./queries";

export async function loadSubmittedTemplateIds(
  interviewRecordId: string,
  templateIds: string[],
): Promise<Set<string>> {
  if (templateIds.length === 0) {
    return new Set();
  }
  const rows = await db
    .select({ templateId: candidateFormSubmission.templateId })
    .from(candidateFormSubmission)
    .where(
      and(
        eq(candidateFormSubmission.interviewRecordId, interviewRecordId),
        inArray(candidateFormSubmission.templateId, templateIds),
      ),
    );
  return new Set(rows.map((row) => row.templateId));
}

export async function loadSubmissionsByInterview(
  interviewRecordId: string,
): Promise<CandidateFormSubmissionWithSnapshot[]> {
  const rows = await db
    .select({
      answers: candidateFormSubmission.answers,
      id: candidateFormSubmission.id,
      interviewRecordId: candidateFormSubmission.interviewRecordId,
      snapshot: candidateFormTemplateVersion.snapshot,
      submittedAt: candidateFormSubmission.submittedAt,
      templateId: candidateFormSubmission.templateId,
      version: candidateFormTemplateVersion.version,
      versionId: candidateFormSubmission.versionId,
    })
    .from(candidateFormSubmission)
    .innerJoin(
      candidateFormTemplateVersion,
      eq(candidateFormSubmission.versionId, candidateFormTemplateVersion.id),
    )
    .where(eq(candidateFormSubmission.interviewRecordId, interviewRecordId))
    .orderBy(asc(candidateFormSubmission.submittedAt));

  return rows.map((row) => ({
    answers: row.answers,
    id: row.id,
    interviewRecordId: row.interviewRecordId,
    snapshot: row.snapshot,
    submittedAt: serializeDate(row.submittedAt),
    templateId: row.templateId,
    version: row.version,
    versionId: row.versionId,
  }));
}

export async function loadSubmissionsByTemplate(templateId: string): Promise<
  (CandidateFormSubmissionRecord & {
    candidateName: string | null;
    snapshot: CandidateFormTemplateSnapshot;
  })[]
> {
  const rows = await db
    .select({
      answers: candidateFormSubmission.answers,
      candidateName: studioInterview.candidateName,
      id: candidateFormSubmission.id,
      interviewRecordId: candidateFormSubmission.interviewRecordId,
      snapshot: candidateFormTemplateVersion.snapshot,
      submittedAt: candidateFormSubmission.submittedAt,
      templateId: candidateFormSubmission.templateId,
      version: candidateFormTemplateVersion.version,
      versionId: candidateFormSubmission.versionId,
    })
    .from(candidateFormSubmission)
    .innerJoin(
      candidateFormTemplateVersion,
      eq(candidateFormSubmission.versionId, candidateFormTemplateVersion.id),
    )
    .leftJoin(studioInterview, eq(candidateFormSubmission.interviewRecordId, studioInterview.id))
    .where(eq(candidateFormSubmission.templateId, templateId))
    .orderBy(desc(candidateFormSubmission.submittedAt));

  return rows.map((row) => ({
    answers: row.answers,
    candidateName: row.candidateName,
    id: row.id,
    interviewRecordId: row.interviewRecordId,
    snapshot: row.snapshot,
    submittedAt: serializeDate(row.submittedAt),
    templateId: row.templateId,
    version: row.version,
    versionId: row.versionId,
  }));
}
