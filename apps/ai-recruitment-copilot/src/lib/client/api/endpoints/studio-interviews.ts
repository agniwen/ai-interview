/**
 * Studio 后台「面试管理」相关 API。
 * Studio admin "interview management" API.
 *
 * 这一组方法对应 `/api/w/:slug/studio/interviews/*` 路由族。JSON 端点全部已迁到
 * Hono RPC（{@link rpc}），错误以 {@link ApiError} 抛出，404 在适用处会被
 * 静默为 null。文件上传 (POST/PATCH 带 resume File) 仍在 dialog 组件中
 * 直接走 fetch + FormData，不在此文件内。
 *
 * Maps to the `/api/w/:slug/studio/interviews/*` route family. JSON endpoints now
 * use Hono RPC under the hood; errors raise {@link ApiError}, and 404s
 * become `null` where applicable. File-upload POST/PATCH stay on raw
 * fetch+FormData inside their dialog components.
 */

import type { CandidateFormSubmissionWithSnapshot } from "@arc/db-schema/candidate-forms";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { StudioInterviewConversationReport } from "@arc/db-schema/interview-session";
import type {
  PaginatedStudioInterviewRoundsResult,
  StudioInterviewRoundDetail,
} from "@arc/shared/studio-interview-rounds";
import type {
  CandidateExpectationsMeta,
  CandidateOutcome,
  ClosedMeta,
  HumanInterviewMeetingInput,
  HumanInterviewRoundInput,
  HumanInterviewRoundOutcome,
  OfferDraftInput,
  PipelineStage,
  ScheduleEntryStatus,
} from "@arc/db-schema/studio-interviews";
import type { ResumeSemanticSourceType } from "@arc/db-schema/schema";
import type {
  HumanInterviewMeetingLinkBundle,
  HumanInterviewMeetingRecord,
  HumanInterviewMeetingTokenResponse,
  HumanInterviewRoundRecord,
  OfferDraftRecord,
} from "@arc/shared/studio-pipeline-stages";
import type { ResumeLibraryProfileSnapshot } from "@arc/shared/studio-resumes";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "../rpc-fetch";

/**
 * 简历语义查重单条命中。
 * A single semantic resume duplicate match entry.
 */
export interface DedupMatchRecord {
  id: string;
  sourceType?: ResumeSemanticSourceType;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  jobDescriptionName: string | null;
  uploaderImage?: string | null;
  uploaderName?: string | null;
  resumeProfileSnapshot?: ResumeLibraryProfileSnapshot | null;
  resumeFileName?: string | null;
  /** Mastered skills for comparison UI (top skills from resume profile). */
  skills?: string[];
  status: "active" | "archived";
  createdAt: string;
  conflictingSignals?: string[];
  level?: "high" | "low" | "medium";
  score?: number;
  semanticReasons?: string[];
  similarity?: {
    resumeOverview?: number;
    skillRole?: number;
    workProject?: number;
  };
}

/**
 * Source candidate summary shown in the "view suspected duplicates" dialog.
 * Built client-side from list-row data so the modal can compare without an extra fetch.
 */
export interface DedupSourceCandidate {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  jobDescriptionName: string | null;
  resumeProfileSnapshot: ResumeLibraryProfileSnapshot | null;
  resumeFileName?: string | null;
  skills: string[];
  sourceType?: ResumeSemanticSourceType;
  createdAt?: string;
  uploaderImage?: string | null;
  uploaderName?: string | null;
}

/**
 * 面试轮次列表分页参数。
 * Interview round list pagination / filter parameters.
 */
export interface StudioInterviewRoundListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  creatorIds?: string[];
  status?: string;
}

/**
 * 拉取面试轮次列表（支持分页 / 关键词 / 状态筛选）。
 * Fetch the interview round list (supports pagination / keyword / status filtering).
 */
export function fetchStudioInterviewRounds(
  slug: string,
  params: StudioInterviewRoundListParams = {},
): Promise<PaginatedStudioInterviewRoundsResult> {
  return rpcFetch<PaginatedStudioInterviewRoundsResult>(
    rpc.api.w[":slug"].studio.interviews.$get({
      param: { slug },
      query: {
        ...(params.page === undefined ? {} : { page: String(params.page) }),
        ...(params.pageSize === undefined ? {} : { pageSize: String(params.pageSize) }),
        ...(params.search ? { search: params.search } : {}),
        ...(params.creatorIds && params.creatorIds.length > 0
          ? { creatorIds: params.creatorIds.join(",") }
          : {}),
        ...(params.status ? { status: params.status } : {}),
      },
    }),
    "加载面试列表失败",
  );
}

/**
 * 面试轮次概览计数（按状态分组）。
 * Interview round summary counts grouped by status.
 */
export interface InterviewRoundSummaryResponse {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  interrupted: number;
}

/**
 * 拉取轮次概览数据（各状态计数）。
 * Fetch the round summary (status counts).
 */
export function fetchStudioInterviewSummary(slug: string): Promise<InterviewRoundSummaryResponse> {
  return rpcFetch<InterviewRoundSummaryResponse>(
    rpc.api.w[":slug"].studio.interviews.summary.$get({ param: { slug } }),
    "加载概览失败",
  );
}

/**
 * 基于解析后的简历画像做语义查重。
 * Look up potential duplicates through semantic resume similarity.
 */
export function fetchInterviewDedup(
  slug: string,
  input: {
    name: string | null;
    email: string | null;
    phone: string | null;
    resumeProfile?: ResumeProfile | null;
  },
  options?: { signal?: AbortSignal },
): Promise<{ matches: DedupMatchRecord[] }> {
  return rpcFetch<{ matches: DedupMatchRecord[] }>(
    rpc.api.w[":slug"].studio.interviews["dedup-check"].$post(
      { json: input, param: { slug } },
      { init: { signal: options?.signal } },
    ),
    "查重失败",
  );
}

/**
 * 把外部链接里的 recordId 解析成 roundId。兼容历史飞书卡片
 * (recordId = studio_interview.id) 与新链接 (recordId = roundId)。命中失败
 * (id 不存在 / 不在当前 org) 时返回 null,不抛错。
 *
 * Resolve an externally supplied recordId into a roundId. Handles both legacy
 * Feishu cards (recordId = studio_interview.id) and current cards
 * (recordId = roundId). Returns null on miss instead of throwing.
 */
export function resolveStudioInterviewRecordId(
  slug: string,
  recordId: string,
): Promise<string | null> {
  return rpcFetch<{ roundId: string }>(
    rpc.api.w[":slug"].studio.interviews.resolve.$get({
      param: { slug },
      query: { id: recordId },
    }),
    "解析面试链接失败",
    { allow404: true },
  ).then((data) => data?.roundId ?? null);
}

/**
 * 拉取单个轮次详情（round + 候选人快照）；不存在时返回 null。
 * Fetch a single interview round detail (round + candidate snapshot); null when not found.
 */
export function fetchStudioInterviewRound(
  slug: string,
  roundId: string,
): Promise<StudioInterviewRoundDetail | null> {
  return rpcFetch<StudioInterviewRoundDetail>(
    rpc.api.w[":slug"].studio.interviews[":id"].$get({ param: { id: roundId, slug } }),
    "加载面试详情失败",
    { allow404: true },
  );
}

/**
 * 拉取某轮次的面试报告列表（按时间倒序，仅含本轮次 conversations）。
 * Fetch the interview reports for a single round (newest first, per-round only).
 */
export function fetchStudioInterviewRoundReports(
  slug: string,
  roundId: string,
): Promise<StudioInterviewConversationReport[]> {
  return rpcFetch<StudioInterviewConversationReport[]>(
    rpc.api.w[":slug"].studio.interviews[":id"].reports.$get({ param: { id: roundId, slug } }),
    "加载面试报告失败",
  );
}

export function fetchStudioInterviewRoundReport(
  slug: string,
  roundId: string,
  conversationId: string,
): Promise<StudioInterviewConversationReport | null> {
  return rpcFetch<StudioInterviewConversationReport>(
    rpc.api.w[":slug"].studio.interviews[":id"].reports[":conversationId"].$get({
      param: { conversationId, id: roundId, slug },
    }),
    "加载面试记录失败",
    { allow404: true },
  );
}

/**
 * 获取某轮录像的 S3 预签名播放 URL (10 分钟有效).
 * Fetch a 10-min presigned URL for the round's recording mp4.
 */
export function fetchStudioInterviewRecordingUrl(
  slug: string,
  roundId: string,
  conversationId: string,
): Promise<{ url: string; expiresInSeconds: number }> {
  return rpcFetch<{ url: string; expiresInSeconds: number }>(
    rpc.api.w[":slug"].studio.interviews[":id"].recordings[":conversationId"].$get({
      param: { conversationId, id: roundId, slug },
    }),
    "加载录像链接失败",
  );
}

/**
 * 拉取轮次关联的表单回答（候选人级别，按提交时间倒序）。
 * Fetch the candidate form submissions for a round (candidate-level, newest first).
 */
export async function fetchStudioInterviewRoundFormSubmissions(
  slug: string,
  roundId: string,
): Promise<CandidateFormSubmissionWithSnapshot[]> {
  const data = await rpcFetch<{ submissions: CandidateFormSubmissionWithSnapshot[] }>(
    rpc.api.w[":slug"].studio.interviews[":id"]["form-submissions"].$get({
      param: { id: roundId, slug },
    }),
    "加载面试表单填写失败",
  );
  return data.submissions;
}

/**
 * 删除某次面试表单回答（重置候选人填写）。
 * Delete a candidate form submission (resets the candidate's fill).
 */
export function deleteStudioInterviewFormSubmission(
  slug: string,
  roundId: string,
  submissionId: string,
): Promise<{ success: boolean }> {
  return rpcFetch<{ success: boolean }>(
    rpc.api.w[":slug"].studio.interviews[":id"]["form-submissions"][":submissionId"].$delete({
      param: { id: roundId, slug, submissionId },
    }),
    "删除答卷失败",
  );
}

/**
 * 重置面试轮次（:id 为 roundId）。
 * Reset an interview round (the flat path; :id is the roundId).
 */
export function resetStudioInterviewRound(
  slug: string,
  roundId: string,
): Promise<StudioInterviewRoundDetail> {
  return rpcFetch<StudioInterviewRoundDetail>(
    rpc.api.w[":slug"].studio.interviews[":id"].reset.$post({ param: { id: roundId, slug } }),
    "重置轮次失败",
  );
}

/**
 * PATCH 单轮的可编辑字段（allowTextInput / notes / scheduledAt / scheduledEndAt / status）。
 * PATCH a round's editable fields.
 */
export function updateStudioInterviewRound(
  slug: string,
  roundId: string,
  payload: {
    allowTextInput?: boolean;
    notes?: string;
    scheduledAt?: string | null;
    scheduledEndAt?: string | null;
    status?: ScheduleEntryStatus;
  },
): Promise<StudioInterviewRoundDetail> {
  return rpcFetch<StudioInterviewRoundDetail>(
    rpc.api.w[":slug"].studio.interviews[":id"].$patch({
      json: payload,
      param: { id: roundId, slug },
    }),
    "更新轮次设置失败",
  );
}

/**
 * 候选人阶段流转（结案 / 重新激活 / 推进阶段）。后端会校验 pipelineStage 与 outcome
 * 的不变量，并在进入/离开 closed 时维护 closedAt + closedReason。
 *
 * Candidate stage transition (close / reactivate / advance). The server
 * enforces the (pipelineStage, outcome) invariant and maintains closedAt +
 * closedReason on entering / leaving the closed stage.
 */
export interface TransitionInterviewInput {
  pipelineStage: PipelineStage;
  outcome?: CandidateOutcome;
  closedReason?: string | null;
  // closedMeta partial：仅在 pipelineStage='closed' 时允许传；previousStage 由服务端写。
  // Partial closedMeta; previousStage is server-controlled.
  closedMeta?: Omit<Partial<ClosedMeta>, "previousStage">;
  reactivationReason?: string;
}

export async function transitionInterviewRecord(
  slug: string,
  candidateId: string,
  input: TransitionInterviewInput,
): Promise<void> {
  await rpcFetch<{ ok: boolean }>(
    rpc.api.w[":slug"].studio.interviews[":id"].transition.$post({
      json: input,
      param: { id: candidateId, slug },
    }),
    "更新候选人阶段失败",
  );
}

/**
 * PATCH 候选人期望（partial merge）。
 * Update candidate expectations (partial merge).
 */
export function updateCandidateExpectations(
  slug: string,
  candidateId: string,
  input: Partial<CandidateExpectationsMeta>,
): Promise<{ candidateExpectationsMeta: CandidateExpectationsMeta }> {
  return rpcFetch<{ candidateExpectationsMeta: CandidateExpectationsMeta }>(
    rpc.api.w[":slug"].studio.interviews[":id"]["candidate-expectations"].$patch({
      json: input,
      param: { id: candidateId, slug },
    }),
    "更新候选人期望失败",
  );
}

// ── 真人复面 client wrappers ──

export function listHumanInterviewMeetings(
  slug: string,
  input: { interviewRecordId?: string } = {},
): Promise<HumanInterviewMeetingRecord[]> {
  return rpcFetch<HumanInterviewMeetingRecord[]>(
    rpc.api.w[":slug"].studio.interviews["human-interview-meetings"].$get({
      param: { slug },
      query: input,
    }),
    "加载真人复面会议失败",
  );
}

export function createHumanInterviewMeeting(
  slug: string,
  input: HumanInterviewMeetingInput,
): Promise<HumanInterviewMeetingRecord> {
  return rpcFetch<HumanInterviewMeetingRecord>(
    rpc.api.w[":slug"].studio.interviews["human-interview-meetings"].$post({
      json: input,
      param: { slug },
    }),
    "新建真人复面会议失败",
  );
}

export function getHumanInterviewMeeting(
  slug: string,
  meetingId: string,
): Promise<HumanInterviewMeetingRecord> {
  return rpcFetch<HumanInterviewMeetingRecord>(
    rpc.api.w[":slug"].studio.interviews["human-interview-meetings"][":meetingId"].$get({
      param: { meetingId, slug },
    }),
    "加载真人复面会议失败",
  );
}

export function issueHumanInterviewMeetingLinks(
  slug: string,
  meetingId: string,
): Promise<HumanInterviewMeetingLinkBundle> {
  return rpcFetch<HumanInterviewMeetingLinkBundle>(
    rpc.api.w[":slug"].studio.interviews["human-interview-meetings"][":meetingId"].links.$post({
      param: { meetingId, slug },
    }),
    "生成真人复面链接失败",
  );
}

export function endHumanInterviewMeeting(
  slug: string,
  meetingId: string,
): Promise<{ ok: boolean }> {
  return rpcFetch<{ ok: boolean }>(
    rpc.api.w[":slug"].studio.interviews["human-interview-meetings"][":meetingId"].end.$post({
      param: { meetingId, slug },
    }),
    "结束真人复面会议失败",
  );
}

export function deleteHumanInterviewMeeting(
  slug: string,
  meetingId: string,
): Promise<{ ok: boolean }> {
  return rpcFetch<{ ok: boolean }>(
    rpc.api.w[":slug"].studio.interviews["human-interview-meetings"][":meetingId"].$delete({
      param: { meetingId, slug },
    }),
    "删除真人复面会议失败",
  );
}

export function getHumanInterviewMeetingLiveKitToken(
  slug: string,
  meetingId: string,
  input: { interviewerId?: string } = {},
): Promise<HumanInterviewMeetingTokenResponse> {
  return rpcFetch<HumanInterviewMeetingTokenResponse>(
    rpc.api.w[":slug"].studio.interviews["human-interview-meetings"][":meetingId"][
      "livekit-token"
    ].$post({
      json: input,
      param: { meetingId, slug },
    }),
    "进入真人复面会议失败",
  );
}

/**
 * 列出候选人所有真人复面轮次（含 cancelled）。
 * List all human interview rounds for a candidate (including cancelled).
 */
export function listHumanInterviewRounds(
  slug: string,
  candidateId: string,
): Promise<HumanInterviewRoundRecord[]> {
  return rpcFetch<HumanInterviewRoundRecord[]>(
    rpc.api.w[":slug"].studio.interviews[":id"]["human-interview-rounds"].$get({
      param: { id: candidateId, slug },
    }),
    "加载真人复面轮次失败",
  );
}

/**
 * 新建真人复面轮次。第一次创建时服务端会自动把 pipelineStage 推进到 human_interview。
 * Create a human interview round; auto-advances the pipeline stage on the first round.
 */
export function createHumanInterviewRound(
  slug: string,
  candidateId: string,
  input: HumanInterviewRoundInput,
): Promise<HumanInterviewRoundRecord> {
  return rpcFetch<HumanInterviewRoundRecord>(
    rpc.api.w[":slug"].studio.interviews[":id"]["human-interview-rounds"].$post({
      json: input,
      param: { id: candidateId, slug },
    }),
    "新建真人复面失败",
  );
}

/**
 * 编辑真人复面轮次。pending 可改全部字段；completed 仅可改 feedback / score。
 * Edit a round; pending allows everything, completed only feedback + score.
 */
export function patchHumanInterviewRound(
  slug: string,
  candidateId: string,
  roundId: string,
  input: Partial<HumanInterviewRoundInput> & { validUntil?: string | null },
): Promise<HumanInterviewRoundRecord> {
  return rpcFetch<HumanInterviewRoundRecord>(
    rpc.api.w[":slug"].studio.interviews[":id"]["human-interview-rounds"][":roundId"].$patch({
      json: input,
      param: { id: candidateId, roundId, slug },
    }),
    "更新真人复面失败",
  );
}

/**
 * 标记真人复面轮次为已完成。
 * Mark a pending round as completed.
 */
export function completeHumanInterviewRound(
  slug: string,
  candidateId: string,
  roundId: string,
  input: { outcome: HumanInterviewRoundOutcome; score?: number | null; feedback: string },
): Promise<HumanInterviewRoundRecord> {
  return rpcFetch<HumanInterviewRoundRecord>(
    rpc.api.w[":slug"].studio.interviews[":id"]["human-interview-rounds"][
      ":roundId"
    ].complete.$post({
      json: input,
      param: { id: candidateId, roundId, slug },
    }),
    "标记完成失败",
  );
}

/**
 * 取消真人复面轮次。已完成轮次不可取消。
 * Cancel a pending round (completed rounds are immutable).
 */
export function cancelHumanInterviewRound(
  slug: string,
  candidateId: string,
  roundId: string,
  input: { reason?: string | null } = {},
): Promise<HumanInterviewRoundRecord> {
  return rpcFetch<HumanInterviewRoundRecord>(
    rpc.api.w[":slug"].studio.interviews[":id"]["human-interview-rounds"][":roundId"].cancel.$post({
      json: input,
      param: { id: candidateId, roundId, slug },
    }),
    "取消轮次失败",
  );
}

// ── Offer 草稿 client wrappers ──

/**
 * 列出候选人所有 Offer 草稿（version desc）。
 * List all offer drafts for a candidate, newest version first.
 */
export function listOfferDrafts(slug: string, candidateId: string): Promise<OfferDraftRecord[]> {
  return rpcFetch<OfferDraftRecord[]>(
    rpc.api.w[":slug"].studio.interviews[":id"]["offer-drafts"].$get({
      param: { id: candidateId, slug },
    }),
    "加载 Offer 列表失败",
  );
}

/**
 * 新建 Offer 修订版本。sendImmediately=true 时直接发送（跳过 draft 状态）。
 * Create a new offer version; pass sendImmediately to skip the draft state.
 */
export function createOfferDraft(
  slug: string,
  candidateId: string,
  input: OfferDraftInput & { sendImmediately?: boolean },
): Promise<OfferDraftRecord> {
  return rpcFetch<OfferDraftRecord>(
    rpc.api.w[":slug"].studio.interviews[":id"]["offer-drafts"].$post({
      json: input,
      param: { id: candidateId, slug },
    }),
    "新建 Offer 失败",
  );
}

/**
 * 编辑草稿（仅 status='draft' 时允许）。
 * Edit a draft (only allowed when status='draft').
 */
export function patchOfferDraft(
  slug: string,
  candidateId: string,
  draftId: string,
  input: Partial<OfferDraftInput>,
): Promise<OfferDraftRecord> {
  return rpcFetch<OfferDraftRecord>(
    rpc.api.w[":slug"].studio.interviews[":id"]["offer-drafts"][":draftId"].$patch({
      json: input,
      param: { draftId, id: candidateId, slug },
    }),
    "更新 Offer 失败",
  );
}

/**
 * draft → sent：HR 把草稿正式发出。
 * Send a draft offer.
 */
export function sendOfferDraft(
  slug: string,
  candidateId: string,
  draftId: string,
): Promise<OfferDraftRecord> {
  return rpcFetch<OfferDraftRecord>(
    rpc.api.w[":slug"].studio.interviews[":id"]["offer-drafts"][":draftId"].send.$post({
      param: { draftId, id: candidateId, slug },
    }),
    "发送 Offer 失败",
  );
}

/**
 * 记录候选人对已发送 Offer 的响应。
 * Record the candidate's response to a sent offer.
 */
export function respondOfferDraft(
  slug: string,
  candidateId: string,
  draftId: string,
  input: { response: "accepted" | "declined" | "counter"; candidateCounter?: string | null },
): Promise<OfferDraftRecord> {
  return rpcFetch<OfferDraftRecord>(
    rpc.api.w[":slug"].studio.interviews[":id"]["offer-drafts"][":draftId"].respond.$post({
      json: input,
      param: { draftId, id: candidateId, slug },
    }),
    "记录 Offer 响应失败",
  );
}

/**
 * HR 撤回 Offer（draft/sent → expired）。
 * HR cancels an active offer (draft or sent → expired).
 */
export function cancelOfferDraft(
  slug: string,
  candidateId: string,
  draftId: string,
): Promise<OfferDraftRecord> {
  return rpcFetch<OfferDraftRecord>(
    rpc.api.w[":slug"].studio.interviews[":id"]["offer-drafts"][":draftId"].cancel.$post({
      param: { draftId, id: candidateId, slug },
    }),
    "撤回 Offer 失败",
  );
}

/**
 * 删除单条面试轮次。
 * Delete a single interview round.
 */
export async function deleteStudioInterviewRound(slug: string, roundId: string): Promise<void> {
  await rpcFetch<{ success: boolean }>(
    rpc.api.w[":slug"].studio.interviews[":id"].$delete({ param: { id: roundId, slug } }),
    "删除轮次失败",
  );
}

/**
 * 批量删除面试轮次。
 * Bulk-delete interview rounds.
 */
export async function bulkDeleteStudioInterviewRounds(
  slug: string,
  roundIds: string[],
): Promise<{ deleted: number; deletedCount?: number; success?: boolean }> {
  const data = await rpcFetch<{ deletedCount: number; success: boolean }>(
    rpc.api.w[":slug"].studio.interviews["bulk-delete"].$post({
      json: { ids: roundIds as [string, ...string[]] },
      param: { slug },
    }),
    "批量删除失败",
  );
  return { deleted: data.deletedCount, ...data };
}
