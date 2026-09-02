import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@server/lib/server/db/index";
import { candidateFormSubmission, jobDescription, studioInterview } from "@app/db-schema/schema";

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
  const orgFilter = eq(studioInterview.organizationId, organizationId);
  const whereClause = search
    ? and(
        orgFilter,
        or(
          ilike(studioInterview.candidateName, `%${search}%`),
          ilike(studioInterview.candidateEmail, `%${search}%`),
        ),
      )
    : orgFilter;

  const rows = await db
    .select({
      candidateName: studioInterview.candidateName,
      id: studioInterview.id,
      jobDescriptionId: studioInterview.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
    })
    .from(studioInterview)
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .where(whereClause)
    .orderBy(desc(studioInterview.createdAt))
    .limit(limit);

  if (rows.length === 0) {
    return [];
  }

  let submittedSet = new Set<string>();
  if (options.templateId) {
    const interviewIds = rows.map((row) => row.id);
    const submitted = await db
      .select({ interviewRecordId: candidateFormSubmission.interviewRecordId })
      .from(candidateFormSubmission)
      .where(
        and(
          eq(candidateFormSubmission.templateId, options.templateId),
          inArray(candidateFormSubmission.interviewRecordId, interviewIds),
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
      candidateName: studioInterview.candidateName,
      id: studioInterview.id,
      jobDescriptionId: studioInterview.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      jobDescriptionPrompt: jobDescription.prompt,
      resumeProfile: studioInterview.resumeProfile,
    })
    .from(studioInterview)
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .where(
      and(
        eq(studioInterview.organizationId, organizationId),
        inArray(studioInterview.id, uniqueIds),
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
