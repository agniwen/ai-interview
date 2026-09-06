import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { recruitingFormSubmission, jobDescription } from "@app/db-schema/schema";

export interface CandidateSearchRow {
  candidateName: string;
  id: string;
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  hasSubmission: boolean;
}

export async function searchCandidatesForFormAi(
  organizationId: string,
  options: { search?: string; templateId?: string; limit?: number },
): Promise<CandidateSearchRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const search = options.search?.trim();
  const orgFilter = eq(recruitingRecordReadModel.organizationId, organizationId);
  const whereClause = search
    ? and(
        orgFilter,
        or(
          ilike(recruitingRecordReadModel.candidateName, `%${search}%`),
          ilike(recruitingRecordReadModel.candidateEmail, `%${search}%`),
        ),
      )
    : orgFilter;

  const rows = await db
    .select({
      candidateName: recruitingRecordReadModel.candidateName,
      id: recruitingRecordReadModel.id,
      jobDescriptionId: recruitingRecordReadModel.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
    })
    .from(recruitingRecordReadModel)
    .leftJoin(jobDescription, eq(recruitingRecordReadModel.jobDescriptionId, jobDescription.id))
    .where(whereClause)
    .orderBy(desc(recruitingRecordReadModel.createdAt))
    .limit(limit);

  if (rows.length === 0) {
    return [];
  }

  let submittedSet = new Set<string>();
  if (options.templateId) {
    const interviewIds = rows.map((row) => row.id);
    const submitted = await db
      .select({ interviewRecordId: recruitingFormSubmission.recruitingRecordId })
      .from(recruitingFormSubmission)
      .where(
        and(
          eq(recruitingFormSubmission.templateId, options.templateId),
          inArray(recruitingFormSubmission.recruitingRecordId, interviewIds),
        ),
      );

    submittedSet = new Set(submitted.map((row) => row.interviewRecordId));
  }

  return rows.map((row) => ({
    candidateName: row.candidateName,
    hasSubmission: submittedSet.has(row.id),
    id: row.id,
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
  }));
}

export async function loadInterviewContextsForFormAi(
  organizationId: string,
  interviewRecordIds: string[],
) {
  if (interviewRecordIds.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(interviewRecordIds)];
  const rows = await db
    .select({
      candidateName: recruitingRecordReadModel.candidateName,
      id: recruitingRecordReadModel.id,
      jobDescriptionId: recruitingRecordReadModel.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      jobDescriptionPrompt: jobDescription.prompt,
      resumeProfile: recruitingRecordReadModel.resumeProfile,
    })
    .from(recruitingRecordReadModel)
    .leftJoin(jobDescription, eq(recruitingRecordReadModel.jobDescriptionId, jobDescription.id))
    .where(
      and(
        eq(recruitingRecordReadModel.organizationId, organizationId),
        inArray(recruitingRecordReadModel.id, uniqueIds),
      ),
    );

  if (rows.length !== uniqueIds.length) {
    return null;
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  return uniqueIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

export async function loadInterviewContextForFormAi(
  organizationId: string,
  interviewRecordId: string,
) {
  const contexts = await loadInterviewContextsForFormAi(organizationId, [interviewRecordId]);
  return contexts?.[0] ?? null;
}
