import {
  candidate,
  candidateResume,
  department,
  jobDescription,
  recruitingEvent,
  recruitingFulfillment,
  recruitingRecord,
  user,
} from "@app/db-schema/schema";
import type { RecruitingStage } from "@app/db-schema/schema";
import type { JsonObject } from "@app/db-schema/json";
import {
  aggregateHrStatistics,
  resolveHrStatisticRanges,
} from "@app/shared/recruiting-hr-statistics";
import type {
  HrStatisticEntry,
  HrStatisticPeriod,
  HrStatisticStage,
} from "@app/shared/recruiting-hr-statistics";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../../../lib/server/db/index";
import type { RecruitingVisibilityScope } from "../../../../../access/recruiting-visibility";

const offerStages = new Set<RecruitingStage>([
  "income_proof",
  "salary_negotiation",
  "offer",
  "background_check",
]);

function metricFor(stage: RecruitingStage | null): HrStatisticStage | null {
  if (!stage || stage === "closed") {
    return null;
  }
  if (offerStages.has(stage)) {
    return "offer_negotiation";
  }
  if (stage === "onboarding") {
    return "pending_onboarding";
  }
  if (
    stage === "screening" ||
    stage === "ai_interview" ||
    stage === "second_interview" ||
    stage === "final_interview"
  ) {
    return stage;
  }
  return null;
}

/** Only native records without a creation audit can use createdAt as their initial entry. */
export function initialStageForUntrackedRecord(
  currentStage: RecruitingStage,
  history: {
    firstStageEvent?: { fromStage: RecruitingStage | null };
    hasCreationEvent: boolean;
    hasMigrationEvent: boolean;
  },
): RecruitingStage | null {
  if (history.hasCreationEvent || history.hasMigrationEvent) {
    return null;
  }
  const initialStage = history.firstStageEvent ? history.firstStageEvent.fromStage : currentStage;
  return initialStage === "closed" ? null : initialStage;
}

function detailString(detail: JsonObject, key: string): string | null {
  const value = z.string().min(1).safeParse(detail[key]);
  return value.success ? value.data : null;
}

function metricSnapshot(detail: JsonObject, key: string, fallback: string | null): string | null {
  return Object.hasOwn(detail, key) ? detailString(detail, key) : fallback;
}

/** A hire counts only while its confirmation is still active; re-hiring uses the latest closure snapshot. */
function activeHiredConfirmation<Event extends { detail: JsonObject }>(
  outcome: string,
  actualJoiningDate: string | null | undefined,
  latestClosure?: Event,
): { at: Date; event: Event | undefined } | null {
  if (outcome !== "hired") {
    return null;
  }
  const joined =
    actualJoiningDate ??
    (latestClosure ? detailString(latestClosure.detail, "actualJoiningDate") : null);
  return joined ? { at: new Date(`${joined}T00:00:00+08:00`), event: latestClosure } : null;
}

// oxlint-disable-next-line complexity -- stage history, resume entries, visibility, and first-entry grouping meet in this read projection.
export async function loadHrStatistics(
  input: {
    departmentIds?: string[];
    from?: string;
    jobIds?: string[];
    now?: Date;
    organizationId: string;
    period: HrStatisticPeriod;
    responsibleHrIds?: string[];
    to?: string;
  },
  visibility: RecruitingVisibilityScope,
) {
  const ranges = resolveHrStatisticRanges(input, input.now);
  const end = new Date(ranges.current.end);
  const visibleCreators = visibility.kind === "restricted" ? visibility.userIds : undefined;
  const visible = visibility.kind !== "none" && (!visibleCreators || visibleCreators.length > 0);
  const visibleCreatorSet = visibleCreators ? new Set(visibleCreators) : null;
  const scopeRecord = visibleCreators?.length
    ? inArray(recruitingRecord.createdBy, visibleCreators)
    : undefined;
  const [records, events, resumes, jobs, departments, people, fulfillments, sourceRecords] = visible
    ? await Promise.all([
        db
          .select({
            candidateId: recruitingRecord.candidateId,
            candidateName: candidate.name,
            createdAt: recruitingRecord.createdAt,
            createdBy: recruitingRecord.createdBy,
            currentStage: recruitingRecord.currentStage,
            id: recruitingRecord.id,
            jobId: recruitingRecord.jobDescriptionId,
            outcome: recruitingRecord.outcome,
            ownerId: recruitingRecord.ownerId,
            stageEnteredAt: recruitingRecord.stageEnteredAt,
          })
          .from(recruitingRecord)
          .innerJoin(candidate, eq(candidate.id, recruitingRecord.candidateId))
          .where(
            and(
              eq(recruitingRecord.organizationId, input.organizationId),
              lt(recruitingRecord.createdAt, end),
              scopeRecord,
            ),
          ),
        db
          .select({
            action: recruitingEvent.action,
            at: recruitingEvent.createdAt,
            detail: recruitingEvent.detail,
            fromStage: recruitingEvent.fromStage,
            id: recruitingEvent.id,
            recordId: recruitingEvent.recruitingRecordId,
            toOutcome: recruitingEvent.toOutcome,
            toStage: recruitingEvent.toStage,
          })
          .from(recruitingEvent)
          .where(
            and(
              eq(recruitingEvent.organizationId, input.organizationId),
              inArray(recruitingEvent.action, [
                "migration.source_copied",
                "recruiting_record_created",
                "recruiting_node_advanced",
                "recruiting_reopened",
                "recruiting_closed",
              ]),
            ),
          ),
        db
          .select({
            at: candidateResume.createdAt,
            candidateId: candidateResume.candidateId,
            candidateName: candidate.name,
            createdBy: candidateResume.createdBy,
            id: candidateResume.id,
            parsedAt: candidateResume.parsedAt,
          })
          .from(candidateResume)
          .innerJoin(candidate, eq(candidate.id, candidateResume.candidateId))
          .where(
            and(
              eq(candidateResume.organizationId, input.organizationId),
              eq(candidateResume.parseStatus, "ready"),
              lt(candidateResume.createdAt, end),
            ),
          ),
        db
          .select({
            departmentId: jobDescription.departmentId,
            id: jobDescription.id,
            name: jobDescription.name,
          })
          .from(jobDescription)
          .where(eq(jobDescription.organizationId, input.organizationId)),
        db
          .select({ id: department.id, name: department.name })
          .from(department)
          .where(eq(department.organizationId, input.organizationId)),
        db.select({ id: user.id, name: user.name }).from(user),
        db
          .select({
            actualJoiningDate: recruitingFulfillment.actualJoiningDate,
            recordId: recruitingFulfillment.recruitingRecordId,
          })
          .from(recruitingFulfillment)
          .where(eq(recruitingFulfillment.organizationId, input.organizationId)),
        db
          .select({
            candidateId: recruitingRecord.candidateId,
            createdAt: recruitingRecord.createdAt,
            id: recruitingRecord.id,
            sourcePoolItemId: recruitingRecord.sourcePoolItemId,
          })
          .from(recruitingRecord)
          .where(
            and(
              eq(recruitingRecord.organizationId, input.organizationId),
              isNotNull(recruitingRecord.sourcePoolItemId),
            ),
          ),
      ])
    : [[], [], [], [], [], [], [], []];
  const recordMap = new Map(records.map((record) => [record.id, record]));
  const jobMap = new Map(jobs.map((job) => [job.id, job]));
  const joiningDateMap = new Map(fulfillments.map((row) => [row.recordId, row.actualJoiningDate]));
  const sourceByCandidate = new Map<string, string>();
  for (const row of sourceRecords.toSorted(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  )) {
    if (row.sourcePoolItemId && !sourceByCandidate.has(row.candidateId)) {
      sourceByCandidate.set(row.candidateId, row.sourcePoolItemId);
    }
  }
  const orderedEvents = events.toSorted(
    (a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id),
  );
  const creationEvent = new Map<string, (typeof orderedEvents)[number]>();
  const latestHiredClosure = new Map<string, (typeof orderedEvents)[number]>();
  const migratedRecords = new Set<string>();
  const firstStageEvent = new Map<string, (typeof orderedEvents)[number]>();
  const candidateAssociation = new Map<
    string,
    { departmentId: string | null; hrId: string | null; jobId: string | null }
  >();
  for (const event of orderedEvents) {
    if (!recordMap.has(event.recordId)) {
      continue;
    }
    if (event.action === "migration.source_copied") {
      migratedRecords.add(event.recordId);
    }
    if (event.action === "recruiting_closed" && event.toOutcome === "hired") {
      latestHiredClosure.set(event.recordId, event);
    }
    if (
      !firstStageEvent.has(event.recordId) &&
      (event.action === "recruiting_node_advanced" ||
        event.action === "recruiting_reopened" ||
        event.action === "recruiting_closed")
    ) {
      firstStageEvent.set(event.recordId, event);
    }
    if (event.action === "recruiting_record_created") {
      creationEvent.set(event.recordId, event);
      const createdRecord = recordMap.get(event.recordId);
      if (createdRecord && !candidateAssociation.has(createdRecord.candidateId)) {
        const jobId = detailString(event.detail, "metricJobDescriptionId");
        candidateAssociation.set(createdRecord.candidateId, {
          departmentId: detailString(event.detail, "metricDepartmentId"),
          hrId: detailString(event.detail, "metricOwnerId"),
          jobId,
        });
      }
    }
  }
  const entries: HrStatisticEntry[] = [];
  function pushRecordEntry(
    record: (typeof records)[number],
    metric: HrStatisticStage | null,
    at: Date,
    event?: (typeof orderedEvents)[number],
  ) {
    if (!metric) {
      return;
    }
    const jobId = event
      ? metricSnapshot(event.detail, "metricJobDescriptionId", record.jobId)
      : record.jobId;
    const hrId = event
      ? metricSnapshot(event.detail, "metricOwnerId", record.ownerId ?? record.createdBy)
      : (record.ownerId ?? record.createdBy);
    const fallbackDepartmentId = jobId ? (jobMap.get(jobId)?.departmentId ?? null) : null;
    const departmentId = event
      ? metricSnapshot(event.detail, "metricDepartmentId", fallbackDepartmentId)
      : fallbackDepartmentId;
    entries.push({
      at: at.toISOString(),
      candidateName: record.candidateName,
      departmentId,
      hrId,
      id: event?.id ?? `created:${record.id}`,
      jobId,
      metric,
      recordId: record.id,
    });
  }
  for (const event of orderedEvents) {
    const record = recordMap.get(event.recordId);
    if (!record) {
      continue;
    }
    if (
      (event.action === "recruiting_node_advanced" || event.action === "recruiting_reopened") &&
      event.toStage !== event.fromStage
    ) {
      pushRecordEntry(record, metricFor(event.toStage), event.at, event);
    }
  }
  for (const record of records) {
    const created = creationEvent.get(record.id);
    if (created) {
      pushRecordEntry(record, metricFor(created.toStage), record.createdAt, created);
    }
    const inferredInitial = initialStageForUntrackedRecord(record.currentStage, {
      firstStageEvent: firstStageEvent.get(record.id),
      hasCreationEvent: Boolean(created),
      hasMigrationEvent: migratedRecords.has(record.id),
    });
    if (inferredInitial) {
      pushRecordEntry(record, metricFor(inferredInitial), record.createdAt);
    }
    if (record.stageEnteredAt && record.currentStage !== "closed") {
      pushRecordEntry(record, metricFor(record.currentStage), record.stageEnteredAt);
    }
    const hiredConfirmation = activeHiredConfirmation(
      record.outcome,
      joiningDateMap.get(record.id),
      latestHiredClosure.get(record.id),
    );
    if (hiredConfirmation) {
      pushRecordEntry(record, "hired", hiredConfirmation.at, hiredConfirmation.event);
    }
    if (!candidateAssociation.has(record.candidateId)) {
      candidateAssociation.set(record.candidateId, {
        departmentId: record.jobId ? (jobMap.get(record.jobId)?.departmentId ?? null) : null,
        hrId: record.ownerId ?? record.createdBy,
        jobId: record.jobId,
      });
    }
  }
  const firstSuccessfulResume = new Map<string, (typeof resumes)[number]>();
  for (const resume of resumes) {
    const sourceId = sourceByCandidate.get(resume.candidateId);
    const identity = sourceId ? `pool:${sourceId}` : `candidate:${resume.candidateId}`;
    const previous = firstSuccessfulResume.get(identity);
    const at = resume.parsedAt ?? resume.at;
    const previousAt = previous?.parsedAt ?? previous?.at;
    if (
      !previous ||
      (previousAt &&
        (at < previousAt || (at.getTime() === previousAt.getTime() && resume.id < previous.id)))
    ) {
      firstSuccessfulResume.set(identity, resume);
    }
  }
  for (const resume of firstSuccessfulResume.values()) {
    if (visibleCreatorSet && (!resume.createdBy || !visibleCreatorSet.has(resume.createdBy))) {
      continue;
    }
    const association = candidateAssociation.get(resume.candidateId);
    entries.push({
      at: (resume.parsedAt ?? resume.at).toISOString(),
      candidateName: resume.candidateName,
      departmentId: association?.departmentId ?? null,
      hrId: association?.hrId ?? resume.createdBy,
      id: resume.id,
      jobId: association?.jobId ?? null,
      metric: "resumes",
      recordId: null,
    });
  }
  const names = new Map(people.map((person) => [person.id, person.name]));
  const result = aggregateHrStatistics(entries, ranges, names, {
    departmentIds: input.departmentIds,
    hrIds: input.responsibleHrIds,
    jobIds: input.jobIds,
  });
  return {
    ...result,
    facets: {
      departments: departments.map((row) => ({ id: row.id, label: row.name })),
      jobs: jobs.map((job) => ({ id: job.id, label: job.name })),
      recruiters: [...new Set(entries.flatMap((entry) => (entry.hrId ? [entry.hrId] : [])))]
        .map((id) => ({ id, label: names.get(id) ?? "离职或未知 HR" }))
        .toSorted((a, b) => a.label.localeCompare(b.label, "zh-CN")),
    },
    limitedVisibility: visibility.kind !== "all",
  };
}
