import type { parseScheduleEntriesInput } from "@app/db-schema/studio-interviews";
import type { StudioCandidateRecord } from "@app/shared/studio-candidates";
import { resumeProfileSchema } from "@app/db-schema/interview/types";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@server/lib/server/db/index";
import {
  globalConfig,
  jobDescription,
  studioInterview,
  studioInterviewSchedule,
} from "@app/db-schema/schema";
import {
  buildCandidateInterviewView,
  pickCurrentScheduleEntry,
  sortScheduleEntries,
} from "@app/shared/interview/interview-record";
import { parseResumeFastToProfile, ResumeAnalysisError } from "../../agents/resume-analysis-agent";
import { projectAttachmentToResumeProfile } from "../../agents/resume-parser-agent";
import {
  createAttachment,
  findAttachmentByContentHash,
  updateStructuredByHash,
} from "../chat/dao/chat-attachments";
import { generateResumeStructured } from "@server/lib/server/resume-parse-pipeline";
import { getResumeDocumentExtension } from "@app/shared/resume-documents";
import {
  flattenPresetQuestionsFromContextSnapshot,
  loadActiveInterviewContextSnapshot,
} from "../studio/routes/interviews/dao/context-snapshots";
import { sha256HexOfBytes } from "@app/shared/file-hash";
import { buildAttachmentKeyByHash, putObjectBytes } from "@app/object-storage";
import { isResumeParseCacheEnabled } from "@server/lib/server/resume-parse-cache-policy";
import { isResumeParseCacheSourceCompatible } from "@server/lib/server/resume-parse-provider";
import { createInternalErrorResponse } from "../../error-handler";
import { resolveCandidateCompanyContext } from "./candidate-briefing";
import {
  createResumeUploadStorage,
  resolveResumeUploadStorage as resolveResumeUploadStorageWithStorage,
} from "./resume-upload-storage";
import type {
  ResolveResumeUploadStorageInput,
  ResumeUploadStorageResult,
} from "./resume-upload-storage";

export type StudioInterviewRow = typeof studioInterview.$inferSelect;
export type StudioInterviewScheduleRow = typeof studioInterviewSchedule.$inferSelect;

// =====================================================================
// Candidate interview record loaders
// =====================================================================

export async function loadCandidateInterviewRecord(id: string, roundId: string) {
  const [record] = await db
    .select()
    .from(studioInterview)
    .where(eq(studioInterview.id, id))
    .limit(1);

  // 候选人侧入口的 stage 守卫：
  // - 新模型用 `pipelineStage='closed'` 表示已结束（rejected / hired / withdrawn / archived）。
  //   结束后不应允许候选人继续打开面试页/拿 token。
  // Candidate-side stage guard:
  // - new model uses `pipelineStage='closed'` for any terminal verdict; once
  //   closed, the candidate must not be able to load the interview view.
  if (!record || record.pipelineStage === "closed") {
    return null;
  }

  const scheduleEntries = await db
    .select()
    .from(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.interviewRecordId, id));

  const view = buildCandidateInterviewView(record, sortScheduleEntries(scheduleEntries), roundId);

  const contextSnapshot = await loadActiveInterviewContextSnapshot(id);
  if (!contextSnapshot) {
    return null;
  }
  const { payload } = contextSnapshot;
  const jobDescriptionPresetQuestions = flattenPresetQuestionsFromContextSnapshot(payload);
  const [currentGlobalConfig] = await db
    .select({ companyContext: globalConfig.companyContext })
    .from(globalConfig)
    .where(eq(globalConfig.organizationId, record.organizationId))
    .limit(1);
  return {
    ...view,
    companyContext: resolveCandidateCompanyContext({
      currentCompanyContext: currentGlobalConfig?.companyContext,
      snapshotCompanyContext: payload.globalConfig.companyContext,
    }),
    interviewQuestions: payload.personalizedQuestions,
    interviewers: payload.interviewers,
    jobDescriptionDescription: null,
    jobDescriptionName: payload.jobDescription?.name ?? null,
    jobDescriptionPresetQuestions,
    jobDescriptionPrompt: payload.jobDescription?.prompt ?? null,
    organizationId: record.organizationId,
  };
}

export async function loadScheduleEntriesForRedirect(id: string) {
  const [record] = await db
    .select({
      id: studioInterview.id,
      pipelineStage: studioInterview.pipelineStage,
    })
    .from(studioInterview)
    .where(eq(studioInterview.id, id))
    .limit(1);

  // 与 loadCandidateInterviewRecord 同步的 stage 守卫；详见上方注释。
  // Mirrors the guard in loadCandidateInterviewRecord above.
  if (!record || record.pipelineStage === "closed") {
    return null;
  }

  const entries = await db
    .select()
    .from(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.interviewRecordId, id));

  const sorted = sortScheduleEntries(entries);
  const active = pickCurrentScheduleEntry(sorted);
  return active;
}

export function buildTokenErrorResponse() {
  return {
    error: "语音通话服务配置缺失，请联系管理员检查环境变量。",
  };
}

// =====================================================================
// Studio interview (management) helpers
// =====================================================================

export function normalizeResumeFile(value: FormDataEntryValue | null) {
  return value instanceof File && value.size > 0 ? value : null;
}

const resumeUploadStorage = createResumeUploadStorage({
  buildAttachmentKeyByHash,
  createAttachment,
  findAttachmentByContentHash,
  generateResumeStructured,
  getResumeDocumentExtension,
  isResumeAnalysisError: (error) => error instanceof ResumeAnalysisError,
  isResumeParseCacheEnabled,
  isResumeParseCacheSourceCompatible,
  parseResumeFastToProfile,
  projectAttachmentToResumeProfile,
  putObjectBytes,
  sha256HexOfBytes,
  updateStructuredByHash,
});

export const { storeInterviewResume } = resumeUploadStorage;
export const { storeResumeObjectOnly } = resumeUploadStorage;

export type { ResumeUploadStorageResult } from "./resume-upload-storage";

export function resolveResumeUploadStorage(
  input: ResolveResumeUploadStorageInput,
): Promise<ResumeUploadStorageResult | null> {
  return resolveResumeUploadStorageWithStorage({
    ...input,
    storeObjectOnly: input.storeObjectOnly ?? resumeUploadStorage.storeResumeObjectOnly,
    storeParsedResume: input.storeParsedResume ?? resumeUploadStorage.storeInterviewResume,
  });
}

// 单行构造拆分：避免上层 map 函数的圈复杂度过高，并方便在 PATCH 编辑时
// 透传 conversationId、热重连锚点等已存在字段。
// Single-row builder, kept separate so callers stay under complexity limits
// and so existing fields (conversationId, hot-reconnect anchors) carry through.
// oxlint-disable-next-line complexity -- Pure data-shape mapping with many nullable carry-overs from the existing row.
function buildSingleScheduleRow(
  entry: ReturnType<typeof parseScheduleEntriesInput>[number],
  index: number,
  orgId: string,
  interviewRecordId: string,
  now: Date,
  existingMap: Map<string, StudioInterviewScheduleRow>,
  createdBy?: string | null,
) {
  const existing = entry.id ? existingMap.get(entry.id.trim()) : undefined;

  return {
    allowTextInput: entry.allowTextInput ?? false,
    conversationId: existing?.conversationId ?? null,
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? createdBy ?? null,
    disconnectedAt: existing?.disconnectedAt ?? null,
    id: entry.id?.trim() || crypto.randomUUID(),
    interviewRecordId,
    liveKitParticipantIdentity: existing?.liveKitParticipantIdentity ?? null,
    liveKitRoomName: existing?.liveKitRoomName ?? null,
    notes: entry.notes?.trim() || null,
    organizationId: existing?.organizationId ?? orgId,
    roundLabel: entry.roundLabel.trim(),
    scheduledAt: entry.scheduledAt ? new Date(entry.scheduledAt) : null,
    scheduledEndAt: entry.scheduledEndAt ? new Date(entry.scheduledEndAt) : null,
    sessionStartedAt: existing?.sessionStartedAt ?? null,
    sortOrder: entry.sortOrder ?? index,
    status: existing?.status ?? ("pending" as const),
    updatedAt: now,
  };
}

export function buildScheduleRows(
  orgId: string,
  interviewRecordId: string,
  entries: ReturnType<typeof parseScheduleEntriesInput>,
  now: Date,
  existingRows?: StudioInterviewScheduleRow[],
  createdBy?: string | null,
) {
  const existingMap = new Map((existingRows ?? []).map((row) => [row.id, row]));

  return entries.map((entry, index) =>
    buildSingleScheduleRow(entry, index, orgId, interviewRecordId, now, existingMap, createdBy),
  );
}

export function loadScheduleEntries(interviewIds: string[]): Promise<StudioInterviewScheduleRow[]> {
  if (interviewIds.length === 0) {
    return Promise.resolve([]);
  }

  return db
    .select()
    .from(studioInterviewSchedule)
    .where(inArray(studioInterviewSchedule.interviewRecordId, interviewIds));
}

// serializeRecord は候補者レベルのフィールドのみ返す（scheduleEntries・interviewLink は round 側）。
// serializeRecord returns only candidate-level fields (scheduleEntries and interviewLink now
// belong to the round-side type).
export function serializeRecord(
  record: StudioInterviewRow,
  _scheduleRows: StudioInterviewScheduleRow[],
  jobDescriptionName: string | null = null,
): StudioCandidateRecord {
  return {
    candidateEmail: record.candidateEmail,
    candidateName: record.candidateName,
    candidatePhone: record.candidatePhone,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    createdBy: record.createdBy,
    creatorName: null,
    creatorOrganizationName: null,
    id: record.id,
    interviewQuestions: record.interviewQuestions ?? [],
    jobDescriptionId: record.jobDescriptionId,
    jobDescriptionName,
    notes: record.notes,
    outcome: record.outcome,
    pipelineStage: record.pipelineStage,
    resumeContentHash: record.resumeContentHash,
    resumeFileName: record.resumeFileName,
    resumeProfile: resumeProfileSchema.nullable().parse(record.resumeProfile),
    resumeStorageKey: record.resumeStorageKey,
    targetRole: record.targetRole,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt,
  };
}

export async function loadRecordById(id: string, organizationId?: string) {
  const where = organizationId
    ? and(eq(studioInterview.id, id), eq(studioInterview.organizationId, organizationId))
    : eq(studioInterview.id, id);

  const [row] = await db
    .select({
      jobDescriptionName: jobDescription.name,
      record: studioInterview,
    })
    .from(studioInterview)
    .leftJoin(
      jobDescription,
      and(
        eq(studioInterview.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, studioInterview.organizationId),
      ),
    )
    .where(where)
    .limit(1);

  if (!row) {
    return null;
  }

  return serializeRecord(row.record, [], row.jobDescriptionName);
}

interface BadRequestErrorBoundary {
  error: unknown;
}

interface BadRequestResult {
  error: string;
  stage?: string;
  status: 400 | 500;
}

export function toBadRequest(error: BadRequestErrorBoundary["error"]): BadRequestResult {
  if (error instanceof ResumeAnalysisError) {
    return {
      ...createInternalErrorResponse({
        context: { stage: error.stage },
        error,
        operation: "resume-analysis",
        publicMessage: "简历解析失败，请稍后重试。",
      }),
      stage: error.stage,
      status: 500,
    };
  }

  if (error instanceof Error) {
    return { error: error.message, status: 400 };
  }

  return { error: "表单校验失败。", status: 400 };
}
