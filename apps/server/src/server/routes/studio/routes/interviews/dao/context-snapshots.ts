import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, exists, isNull, or } from "drizzle-orm";
import type {
  InterviewContextSnapshotPayload,
  InterviewContextSnapshotReason,
  InterviewSnapshotStatus,
} from "@app/db-schema/interview-snapshots";
import type { InterviewQuestion } from "@app/db-schema/interview/types";
import type {
  InterviewQuestionFollowUpContract,
  InterviewQuestionTemplateDifficulty,
} from "@app/db-schema/interview-question-templates";
import { jsonValueSchema, stableStringify } from "../../../../../../lib/server/stable-stringify";
import type { JsonValue } from "../../../../../../lib/server/stable-stringify";
import { db } from "../../../../../../lib/server/db/index";
import {
  candidateFormTemplate,
  candidateFormTemplateJobDescription,
  globalConfig,
  recruitingContextSnapshot,
  interviewer,
  interviewQuestionTemplate,
  recruitingQuestionTemplateBinding,
  interviewQuestionTemplateVersion,
  jobDescription,
  jobDescriptionInterviewer,
} from "@app/db-schema/schema";
import { serializeDate } from "../../../../../../lib/server/db/serialize";
import { resolveOrCreateTemplateVersion } from "../../forms/dao/versions";
import {
  autoBindApplicableTemplates,
  refreshInterviewBindingsToLatest,
} from "../../interview-questions/dao/bindings";

export type BuildInterviewContextSnapshotPayloadInput = Omit<
  InterviewContextSnapshotPayload,
  "schemaVersion"
>;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface InterviewContextSnapshotRecord {
  contentHash: string;
  createdAt: string;
  createdBy: string | null;
  id: string;
  interviewRecordId: string;
  organizationId: string;
  payload: InterviewContextSnapshotPayload;
  reason: InterviewContextSnapshotReason;
  scheduleEntryId: string | null;
  status: InterviewSnapshotStatus;
  supersededAt: string | null;
  version: number;
}

export interface CreateInterviewContextSnapshotOptions {
  createdAt?: Date;
  createdBy: string | null;
  interviewRecordId: string;
  personalizedQuestions?: InterviewQuestion[];
  reason: InterviewContextSnapshotReason;
  scheduleEntryId: string | null;
}

export interface ContextSnapshotPresetQuestion {
  content: string;
  difficulty: InterviewQuestionTemplateDifficulty;
  evaluationFocus?: string | null;
  followUpDirections?: string | null;
  followUpContract?: InterviewQuestionFollowUpContract | null;
  id: string;
}

export function buildInterviewContextSnapshotPayload(
  input: BuildInterviewContextSnapshotPayloadInput,
): InterviewContextSnapshotPayload {
  return {
    ...input,
    schemaVersion: 1,
  };
}

export function hashSnapshotPayload(payload: JsonValue): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function serializeSnapshotRow(
  row: typeof recruitingContextSnapshot.$inferSelect,
): InterviewContextSnapshotRecord {
  return {
    contentHash: row.contentHash,
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    id: row.id,
    interviewRecordId: row.recruitingRecordId,
    organizationId: row.organizationId,
    payload: row.payload,
    reason: row.reason,
    scheduleEntryId: row.aiRoundId,
    status: row.status,
    supersededAt: row.supersededAt ? serializeDate(row.supersededAt) : null,
    version: row.version,
  };
}

async function loadApplicableFormTemplateIds(
  tx: Tx,
  organizationId: string,
  jobDescriptionId: string | null,
): Promise<string[]> {
  const rows = await tx
    .select({
      createdAt: candidateFormTemplate.createdAt,
      id: candidateFormTemplate.id,
      scope: candidateFormTemplate.scope,
    })
    .from(candidateFormTemplate)
    .where(
      and(
        isNull(candidateFormTemplate.archivedAt),
        eq(candidateFormTemplate.organizationId, organizationId),
        or(
          eq(candidateFormTemplate.scope, "global"),
          jobDescriptionId
            ? and(
                eq(candidateFormTemplate.scope, "job_description"),
                exists(
                  tx
                    .select({ one: candidateFormTemplateJobDescription.templateId })
                    .from(candidateFormTemplateJobDescription)
                    .innerJoin(
                      jobDescription,
                      eq(candidateFormTemplateJobDescription.jobDescriptionId, jobDescription.id),
                    )
                    .where(
                      and(
                        eq(
                          candidateFormTemplateJobDescription.templateId,
                          candidateFormTemplate.id,
                        ),
                        eq(candidateFormTemplateJobDescription.jobDescriptionId, jobDescriptionId),
                        eq(jobDescription.organizationId, candidateFormTemplate.organizationId),
                      ),
                    ),
                ),
              )
            : undefined,
        ),
      ),
    );

  return rows
    .toSorted((a, b) => {
      if (a.scope !== b.scope) {
        return a.scope === "job_description" ? -1 : 1;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    })
    .map((row) => row.id);
}

async function buildSnapshotPayloadFromDatabase(
  tx: Tx,
  options: CreateInterviewContextSnapshotOptions,
): Promise<{ organizationId: string; payload: InterviewContextSnapshotPayload }> {
  const [candidate] = await tx
    .select()
    .from(recruitingRecordReadModel)
    .where(eq(recruitingRecordReadModel.id, options.interviewRecordId))
    .limit(1);
  if (!candidate) {
    throw new Error(`studio_interview ${options.interviewRecordId} not found`);
  }

  await (options.reason === "manual_refresh" || options.reason === "reset"
    ? refreshInterviewBindingsToLatest(tx, options.interviewRecordId, candidate.jobDescriptionId)
    : autoBindApplicableTemplates(tx, options.interviewRecordId, candidate.jobDescriptionId));

  const [jd] = candidate.jobDescriptionId
    ? await tx
        .select({
          id: jobDescription.id,
          name: jobDescription.name,
          prompt: jobDescription.prompt,
        })
        .from(jobDescription)
        .where(
          and(
            eq(jobDescription.id, candidate.jobDescriptionId),
            eq(jobDescription.organizationId, candidate.organizationId),
            eq(jobDescription.lifecycleStatus, "published"),
          ),
        )
        .limit(1)
    : [];

  const [globalCfg] = await tx
    .select({
      closingInstructions: globalConfig.closingInstructions,
      companyContext: globalConfig.companyContext,
      openingInstructions: globalConfig.openingInstructions,
    })
    .from(globalConfig)
    .where(eq(globalConfig.organizationId, candidate.organizationId))
    .limit(1);

  const interviewerRows = candidate.jobDescriptionId
    ? await tx
        .select({ name: interviewer.name, prompt: interviewer.prompt, voice: interviewer.voice })
        .from(jobDescriptionInterviewer)
        .innerJoin(interviewer, eq(jobDescriptionInterviewer.interviewerId, interviewer.id))
        .where(
          and(
            eq(jobDescriptionInterviewer.jobDescriptionId, candidate.jobDescriptionId),
            eq(interviewer.organizationId, candidate.organizationId),
          ),
        )
    : [];

  const formTemplateIds = await loadApplicableFormTemplateIds(
    tx,
    candidate.organizationId,
    candidate.jobDescriptionId,
  );
  const forms = [];
  for (const templateId of formTemplateIds) {
    const version = await resolveOrCreateTemplateVersion(tx, templateId);
    forms.push({
      snapshot: version.snapshot,
      templateId,
      version: version.version,
      versionId: version.id,
    });
  }

  const questionRows = await tx
    .select({
      bindingId: recruitingQuestionTemplateBinding.id,
      disabledByUser: recruitingQuestionTemplateBinding.disabledByUser,
      scope: interviewQuestionTemplate.scope,
      snapshot: interviewQuestionTemplateVersion.snapshot,
      sortOrder: recruitingQuestionTemplateBinding.sortOrder,
      templateId: recruitingQuestionTemplateBinding.templateId,
      version: interviewQuestionTemplateVersion.version,
      versionId: recruitingQuestionTemplateBinding.versionId,
    })
    .from(recruitingQuestionTemplateBinding)
    .innerJoin(
      interviewQuestionTemplateVersion,
      eq(recruitingQuestionTemplateBinding.versionId, interviewQuestionTemplateVersion.id),
    )
    .innerJoin(
      interviewQuestionTemplate,
      eq(recruitingQuestionTemplateBinding.templateId, interviewQuestionTemplate.id),
    )
    .where(eq(recruitingQuestionTemplateBinding.recruitingRecordId, options.interviewRecordId))
    .orderBy(asc(recruitingQuestionTemplateBinding.sortOrder));

  const payload = buildInterviewContextSnapshotPayload({
    candidate: {
      candidateEmail: candidate.candidateEmail,
      candidateName: candidate.candidateName,
      candidatePhone: candidate.candidatePhone,
      resumeProfile: candidate.resumeProfile,
      targetRole: candidate.targetRole,
    },
    createdAt: (options.createdAt ?? new Date()).toISOString(),
    forms,
    globalConfig: {
      closingInstructions: globalCfg?.closingInstructions ?? "",
      companyContext: globalCfg?.companyContext ?? "",
      openingInstructions: globalCfg?.openingInstructions ?? "",
    },
    interviewRecordId: options.interviewRecordId,
    interviewers: interviewerRows.map((row) => ({
      name: row.name,
      prompt: row.prompt,
      voice: row.voice,
    })),
    jobDescription: jd
      ? {
          id: jd.id,
          name: jd.name,
          prompt: jd.prompt,
        }
      : null,
    personalizedQuestions: options.personalizedQuestions ?? candidate.interviewQuestions,
    questionTemplates: questionRows.map((row) => ({
      bindingId: row.bindingId,
      disabledByUser: row.disabledByUser,
      scope: row.scope,
      snapshot: row.snapshot,
      sortOrder: row.sortOrder,
      templateId: row.templateId,
      version: row.version,
      versionId: row.versionId,
    })),
    scheduleEntryId: options.scheduleEntryId,
  });

  return { organizationId: candidate.organizationId, payload };
}

export async function createInterviewContextSnapshot(
  tx: Tx,
  options: CreateInterviewContextSnapshotOptions,
): Promise<InterviewContextSnapshotRecord> {
  const now = options.createdAt ?? new Date();
  const { organizationId, payload } = await buildSnapshotPayloadFromDatabase(tx, {
    ...options,
    createdAt: now,
  });
  const [latest] = await tx
    .select({ version: recruitingContextSnapshot.version })
    .from(recruitingContextSnapshot)
    .where(eq(recruitingContextSnapshot.recruitingRecordId, options.interviewRecordId))
    .orderBy(desc(recruitingContextSnapshot.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const [inserted] = await tx
    .insert(recruitingContextSnapshot)
    .values({
      aiRoundId: options.scheduleEntryId,
      contentHash: hashSnapshotPayload(jsonValueSchema.parse(payload)),
      createdAt: now,
      createdBy: options.createdBy,
      id: crypto.randomUUID(),
      organizationId,
      payload,
      reason: options.reason,
      recruitingRecordId: options.interviewRecordId,
      status: "active",
      version: nextVersion,
    })
    .returning();
  if (!inserted) {
    throw new Error("interview context snapshot insert failed");
  }
  return serializeSnapshotRow(inserted);
}

export async function refreshInterviewContextSnapshot(
  tx: Tx,
  options: CreateInterviewContextSnapshotOptions,
): Promise<InterviewContextSnapshotRecord> {
  const now = options.createdAt ?? new Date();
  await tx
    .update(recruitingContextSnapshot)
    .set({ status: "superseded", supersededAt: now })
    .where(
      and(
        eq(recruitingContextSnapshot.recruitingRecordId, options.interviewRecordId),
        eq(recruitingContextSnapshot.status, "active"),
      ),
    );
  return createInterviewContextSnapshot(tx, { ...options, createdAt: now });
}

export async function loadActiveInterviewContextSnapshot(
  interviewRecordId: string,
): Promise<InterviewContextSnapshotRecord | null> {
  const [row] = await db
    .select()
    .from(recruitingContextSnapshot)
    .where(
      and(
        eq(recruitingContextSnapshot.recruitingRecordId, interviewRecordId),
        eq(recruitingContextSnapshot.status, "active"),
      ),
    )
    .orderBy(desc(recruitingContextSnapshot.version))
    .limit(1);
  return row ? serializeSnapshotRow(row) : null;
}

export async function loadOrCreateActiveInterviewContextSnapshot(
  options: CreateInterviewContextSnapshotOptions,
): Promise<InterviewContextSnapshotRecord> {
  const existing = await loadActiveInterviewContextSnapshot(options.interviewRecordId);
  if (existing) {
    return existing;
  }
  return db.transaction((tx) => createInterviewContextSnapshot(tx, options));
}

export function flattenPresetQuestionsFromContextSnapshot(
  payload: InterviewContextSnapshotPayload,
): ContextSnapshotPresetQuestion[] {
  const out: ContextSnapshotPresetQuestion[] = [];
  const enabledTemplates = payload.questionTemplates
    .filter((template) => !template.disabledByUser)
    .toSorted((a, b) => a.sortOrder - b.sortOrder);

  for (const template of enabledTemplates) {
    const questions = [...template.snapshot.questions].toSorted(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    for (const question of questions) {
      const content = question.content.trim();
      if (content) {
        out.push({
          content,
          difficulty: question.difficulty,
          evaluationFocus: question.evaluationFocus ?? null,
          followUpContract: question.followUpContract ?? null,
          followUpDirections: question.followUpDirections ?? null,
          id: question.id,
        });
      }
    }
  }
  return out;
}
