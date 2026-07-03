import type { ContentfulStatusCode } from "hono/utils/http-status";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { and, eq, ne } from "drizzle-orm";
import { AccessToken } from "livekit-server-sdk";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  buildRecordingFileKey,
  isRecordingStorageConfigured,
} from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import {
  candidateFormSubmission,
  studioInterview,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";
import { buildCandidateFormAnswersSchema } from "@arc/db-schema/candidate-forms";
import { RECONNECT_GRACE_MS } from "@arc/db-schema/studio-interviews";
import {
  streamGenerateInterviewQuestions,
  streamGenerateResumeReviewMarkdownFirst,
  streamGenerateResumeReview,
  streamParseResumeProfile,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { authMiddleware } from "@arc/ai-recruitment-copilot-backend/server/middlewares/auth";
import { resumeProfileSchema } from "@arc/db-schema/interview/types";
import {
  listAllJobDescriptions,
  loadJobDescriptionById,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { getGlobalConfig } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/global-config/dao";
import { loadSubmittedTemplateIds } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/forms/dao/submissions";
import { loadActiveInterviewContextSnapshot } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/context-snapshots";
import {
  cacheTags,
  lookupOrgIdByInterviewRecord,
  safeUpdateTag,
} from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import { resolveInterviewRecordingEnabled } from "@arc/shared/interview/recording-config";
import {
  buildTokenErrorResponse,
  loadCandidateInterviewRecord,
  loadScheduleEntriesForRedirect,
} from "./utils";
import { resolveJobDescriptionMatchBestEffort } from "./match-job-description";

export const interviewRouter = factory
  .createApp()
  .post("/parse-resume", authMiddleware, async (c) => {
    const formData = await c.req.formData();
    const resume = formData.get("resume");

    if (!(resume instanceof File)) {
      return c.json({ error: "缺少简历文件。" }, 400);
    }

    // 把 userId + activeOrganizationId 透传给流式解析器；缺任意一个就跳过缓存写入。
    // 这里不挂 workspace 中间件，所以从 session 直接读 activeOrganizationId（与
    // resume chat 路由的取法保持一致）。
    // Forward userId + activeOrganizationId so the streamer can populate the
    // chat_attachment registry on cache miss. We read activeOrganizationId off
    // the session directly (no workspace middleware on this route), matching
    // how the resume chat router resolves it.
    const userId = c.var.user?.id;
    const organizationId =
      (c.var.session as { activeOrganizationId?: string | null } | null)?.activeOrganizationId ??
      null;
    const context = userId ? { organizationId, userId } : undefined;

    try {
      const stream = streamParseResumeProfile(resume, context);
      return new Response(stream, {
        headers: {
          "Cache-Control": "no-cache",
          "Content-Type": "text/event-stream",
          "Transfer-Encoding": "chunked",
          "X-Accel-Buffering": "no",
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        const status = error.message.includes("PDF") || error.message.includes("MB") ? 400 : 500;
        return c.json(
          { error: error.message, stage: "resume-parsing" },
          status as ContentfulStatusCode,
        );
      }

      return c.json({ error: "Failed to parse resume.", stage: "resume-parsing" }, 500);
    }
  })
  .post(
    "/match-job-description",
    authMiddleware,
    zValidator(
      "json",
      z.object({
        interviewRecordId: z.string().optional(),
        resumeProfile: resumeProfileSchema,
      }),
      jsonValidatorError("缺少候选人信息 (resumeProfile)。"),
    ),
    async (c) => {
      const { interviewRecordId, resumeProfile } = c.req.valid("json");

      // 优先用 interviewRecord 解析 orgId(候选人场景),否则回退到 session.activeOrganizationId(chat 内点匹配)。
      // 两者都没有就拒——说明请求脱离了任何 workspace 上下文。
      // Prefer the interview record (candidate-side); fall back to
      // session.activeOrganizationId (chat-side). Reject when neither is
      // available — the request has no workspace context.
      let orgId: string | null = null;
      if (interviewRecordId) {
        const [row] = await db
          .select({ organizationId: studioInterview.organizationId })
          .from(studioInterview)
          .where(eq(studioInterview.id, interviewRecordId))
          .limit(1);
        orgId = row?.organizationId ?? null;
      }
      if (!orgId) {
        orgId =
          (c.var.session as { activeOrganizationId?: string | null } | null)
            ?.activeOrganizationId ?? null;
      }
      if (!orgId) {
        return c.json({ error: "No active workspace" }, 400);
      }

      try {
        const jobDescriptions = await listAllJobDescriptions(orgId);
        const match = await resolveJobDescriptionMatchBestEffort({
          jobDescriptions,
          resumeProfile,
        });
        return c.json(match, 200);
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : "在招岗位匹配失败。" },
          500,
        );
      }
    },
  )
  .post(
    "/generate-questions",
    authMiddleware,
    zValidator(
      "json",
      z.object({ resumeProfile: resumeProfileSchema }),
      jsonValidatorError("缺少候选人信息 (resumeProfile)。"),
    ),
    (c) => {
      const { resumeProfile } = c.req.valid("json");
      const stream = streamGenerateInterviewQuestions(resumeProfile);
      return new Response(stream, {
        headers: {
          "Cache-Control": "no-cache",
          "Content-Type": "text/event-stream",
          "Transfer-Encoding": "chunked",
          "X-Accel-Buffering": "no",
        },
      });
    },
  )
  .post(
    "/generate-review",
    authMiddleware,
    zValidator(
      "json",
      z.object({
        jobDescriptionId: z.string().trim().optional().nullable(),
        resumeProfile: resumeProfileSchema,
      }),
      jsonValidatorError("缺少候选人信息 (resumeProfile)。"),
    ),
    async (c) => {
      const { jobDescriptionId, resumeProfile } = c.req.valid("json");

      // 取 JD prompt 作为评价上下文。jobDescriptionId 来自前端 JD 匹配阶段的回填,
      // org scope 用当前 session 的 activeOrganizationId（generate-review 跟在
      // JD 匹配后调用，那时 active org 已经定）；查不到 JD 静默退化为无 JD 评价。
      // Resolve the JD prompt as review context. The id comes from the
      // pipeline's match-job-description step; org scoping uses the active
      // organization on the session. Silently fall back to a JD-less review if
      // the id resolves to nothing (org-mismatch / freshly-deleted JD / etc.).
      let jobDescriptionText: string | null = null;
      if (jobDescriptionId) {
        const orgId =
          (c.var.session as { activeOrganizationId?: string | null } | null)
            ?.activeOrganizationId ?? null;
        if (orgId) {
          const jd = await loadJobDescriptionById(orgId, jobDescriptionId);
          if (jd) {
            jobDescriptionText = [
              `岗位名称：${jd.name}`,
              jd.description ? `岗位描述：${jd.description}` : null,
              `岗位 Prompt：\n${jd.prompt}`,
            ]
              .filter(Boolean)
              .join("\n\n");
          }
        }
      }

      const stream = streamGenerateResumeReview({
        jobDescription: jobDescriptionText,
        resumeProfile,
      });

      return new Response(stream, {
        headers: {
          "Cache-Control": "no-cache",
          "Content-Type": "text/event-stream",
          "Transfer-Encoding": "chunked",
          "X-Accel-Buffering": "no",
        },
      });
    },
  )
  .post(
    "/generate-review-markdown-stream",
    authMiddleware,
    zValidator(
      "json",
      z.object({
        jobDescriptionId: z.string().trim().optional().nullable(),
        resumeProfile: resumeProfileSchema,
      }),
      jsonValidatorError("缺少候选人信息 (resumeProfile)。"),
    ),
    async (c) => {
      const { jobDescriptionId, resumeProfile } = c.req.valid("json");

      let jobDescriptionText: string | null = null;
      if (jobDescriptionId) {
        const orgId =
          (c.var.session as { activeOrganizationId?: string | null } | null)
            ?.activeOrganizationId ?? null;
        if (orgId) {
          const jd = await loadJobDescriptionById(orgId, jobDescriptionId);
          if (jd) {
            jobDescriptionText = [
              `岗位名称：${jd.name}`,
              jd.description ? `岗位描述：${jd.description}` : null,
              `岗位 Prompt：\n${jd.prompt}`,
            ]
              .filter(Boolean)
              .join("\n\n");
          }
        }
      }

      const stream = streamGenerateResumeReviewMarkdownFirst({
        jobDescription: jobDescriptionText,
        resumeProfile,
      });

      return new Response(stream, {
        headers: {
          "Cache-Control": "no-cache",
          "Content-Type": "text/event-stream",
          "Transfer-Encoding": "chunked",
          "X-Accel-Buffering": "no",
        },
      });
    },
  )
  // oxlint-disable-next-line complexity -- Token issuance composes auth, form gate, and the hot-reconnect state machine in one flow.
  .post("/:id/:roundId/livekit-token", async (c) => {
    const id = c.req.param("id");
    const roundId = c.req.param("roundId");
    const interviewRecord = await loadCandidateInterviewRecord(id, roundId);

    if (!interviewRecord) {
      return c.json({ error: "Interview not available." }, 404);
    }

    if (!interviewRecord.currentRoundId) {
      return c.json({ error: "Round not found." }, 404);
    }

    if (interviewRecord.currentRoundStatus === "completed") {
      return c.json({ error: "当前面试轮次已结束，如需重新面试请联系管理员。" }, 403);
    }

    const contextSnapshot = await loadActiveInterviewContextSnapshot(id);
    if (!contextSnapshot) {
      return c.json({ error: "Interview not available." }, 404);
    }
    const requiredTemplateIds = contextSnapshot.payload.forms.map((form) => form.templateId);
    if (requiredTemplateIds.length > 0) {
      const submittedIds = await loadSubmittedTemplateIds(id, requiredTemplateIds);
      if (submittedIds.size < requiredTemplateIds.length) {
        return c.json({ code: "forms_required", error: "请先完成面试表单。" }, 409);
      }
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const serverUrl = process.env.LIVEKIT_URL;
    const agentName = process.env.AGENT_NAME;

    if (!apiKey || !apiSecret || !serverUrl) {
      return c.json(buildTokenErrorResponse(), 500);
    }

    // 热重连：在事务里加行锁后判定状态机；
    //   pending → 生成新 roomName/identity 并写库；
    //   interrupted 在 3 分钟内 → 复用持久化的 roomName/identity；
    //   interrupted 已过期 → 同事务置 completed 并返回 410；
    //   in_progress 且 disconnectedAt 为空 → 视为占用中，返回 409；
    // 用 FOR UPDATE 防止两个 tab/设备并发竞争同一轮次。
    // Hot-reconnect: a SELECT … FOR UPDATE state-machine inside a transaction.
    // pending → mint and persist new roomName/identity; interrupted-in-window →
    // reuse the persisted ones; interrupted-expired → flip to completed + 410;
    // in_progress with disconnectedAt null → 409 (taken by another tab/device).
    type TokenResolution =
      | {
          status: "ready";
          roomName: string;
          participantIdentity: string;
          isReconnect: boolean;
        }
      | { status: "grace_expired" }
      | { status: "round_completed" };

    const participantName = interviewRecord.candidateName || "candidate";
    const now = new Date();

    const resolution = await db.transaction(async (tx): Promise<TokenResolution> => {
      const [row] = await tx
        .select({
          disconnectedAt: studioInterviewSchedule.disconnectedAt,
          liveKitParticipantIdentity: studioInterviewSchedule.liveKitParticipantIdentity,
          liveKitRoomName: studioInterviewSchedule.liveKitRoomName,
          status: studioInterviewSchedule.status,
        })
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.id, roundId))
        .for("update")
        .limit(1);

      if (!row) {
        return { status: "round_completed" };
      }

      // 同事务里再校验一遍 completed —— 早先 loadCandidateInterviewRecord 之后
      // 可能被 agent /report 抢先置 completed，避免发出错乱的 token。
      // Re-check completed under the row lock to defend against a race where
      // /api/agent/report flipped status between our earlier read and now.
      if (row.status === "completed") {
        return { status: "round_completed" };
      }

      // interrupted 已过期：写 completed + 清 anchor 后返 410。
      // Expired grace: persist completed and clear anchors before 410.
      if (row.status === "interrupted" && row.disconnectedAt) {
        const elapsed = now.getTime() - new Date(row.disconnectedAt).getTime();
        if (elapsed > RECONNECT_GRACE_MS) {
          await tx
            .update(studioInterviewSchedule)
            .set({
              disconnectedAt: null,
              liveKitParticipantIdentity: null,
              liveKitRoomName: null,
              status: "completed" as const,
              updatedAt: now,
            })
            .where(eq(studioInterviewSchedule.id, roundId));
          return { status: "grace_expired" };
        }
      }

      // 复用现有 anchor，幂等：in_progress 与 interrupted-in-window 都走这里。
      // useSession() 在 mount 时会先调一次 prepareConnection 拿 token 预热，
      // 之后用户 session.start() 又调一次。如果这里写 status / disconnectedAt
      // 第二次调用会因为状态已变被拒，所以保持只读。
      // Reuse existing anchors as a pure read (idempotent path); applies to
      // in_progress and interrupted-in-window. useSession's mount-time
      // prepareConnection fetches once, then session.start() fetches again;
      // if we mutated state on the first call, the second would be rejected.
      if (row.liveKitRoomName && row.liveKitParticipantIdentity) {
        return {
          isReconnect: row.status === "interrupted",
          participantIdentity: row.liveKitParticipantIdentity,
          roomName: row.liveKitRoomName,
          status: "ready",
        };
      }

      // 首次开始（pending），或异常缺失锚点的 in_progress（兜底当作首次）。
      // Fresh start (pending) or in_progress without anchors (defensive fallback).
      const freshRoomName = `interview_${id}_${roundId}_${Math.floor(Math.random() * 10_000)}`;
      const freshIdentity = `candidate_${id}_${roundId}_${Math.floor(Math.random() * 10_000)}`;
      await tx
        .update(studioInterviewSchedule)
        .set({
          disconnectedAt: null,
          liveKitParticipantIdentity: freshIdentity,
          liveKitRoomName: freshRoomName,
          sessionStartedAt: now,
          status: "in_progress" as const,
          updatedAt: now,
        })
        .where(eq(studioInterviewSchedule.id, roundId));
      // 记录级 status 跟着抬一档：候选人真的进场了，整条记录就不再是「待面试」。
      // 守卫 status='ready' 避免覆盖 archived/completed 等终态（极端 race 下可能命中）。
      // Bump the record-level status to mirror that interviewing has actually
      // begun. Guard on status='ready' so we never overwrite terminal states.
      await tx
        .update(studioInterview)
        .set({ status: "in_progress" as const, updatedAt: now })
        .where(and(eq(studioInterview.id, id), eq(studioInterview.status, "ready")));
      return {
        isReconnect: false,
        participantIdentity: freshIdentity,
        roomName: freshRoomName,
        status: "ready",
      };
    });

    if (resolution.status === "round_completed") {
      return c.json({ error: "当前面试轮次已结束，如需重新面试请联系管理员。" }, 403);
    }

    if (resolution.status === "grace_expired") {
      return c.json({ code: "grace_expired", error: "重连超时，本轮面试已结束。" }, 410);
    }

    const { roomName, participantIdentity, isReconnect } = resolution;

    // Interview context is surfaced to the Python agent worker via participant metadata.
    // Python: `ctx.wait_for_participant()` → `participant.metadata` → JSON.parse.
    // When the JD has multiple interviewers, the agent picks one at random.
    // 系统设置（公司背景、开场/结束指令）在颁发 token 前读取并注入。
    // Global config (company context, opening/closing instructions) is read before token issuance and injected here.
    // Candidate-facing route has no authenticated org context; derive the org from the
    // interview record itself. studio_interview.organization_id 已 NOT NULL,直接取。
    // studio_interview.organization_id is NOT NULL — read it directly.
    const globalCfg = await getGlobalConfig(interviewRecord.organizationId);
    // 录像开关：显式环境变量未关闭且 R2 录像桶凭据齐全时，才让 Agent 启动 Egress。
    // 候选人浏览器拒绝摄像头时由前端侧降级；这里只判服务端能力与部署开关。
    // Recording switch: only enable when both the feature flag and R2 storage are present.
    const recordingEnabled =
      resolveInterviewRecordingEnabled(process.env) && isRecordingStorageConfigured();
    const recordingFileKey = recordingEnabled
      ? await buildRecordingFileKey({
          interviewRecordId: id,
          roomName,
          roundId,
        })
      : null;
    const participantMetadata = JSON.stringify({
      candidate_name: interviewRecord.candidateName,
      candidate_profile: interviewRecord.resumeProfile,
      global_closing_instructions: globalCfg.closingInstructions,
      global_company_context: globalCfg.companyContext,
      global_opening_instructions: globalCfg.openingInstructions,
      interview_questions: interviewRecord.interviewQuestions,
      interview_record_id: id,
      interviewers: interviewRecord.interviewers,
      job_description_preset_questions: interviewRecord.jobDescriptionPresetQuestions ?? [],
      job_description_prompt: interviewRecord.jobDescriptionPrompt ?? null,
      recording_enabled: recordingEnabled,
      recording_file_key: recordingFileKey,
      round_id: roundId,
      target_role: interviewRecord.jobDescriptionName?.trim() || "未指定岗位",
    });

    try {
      const at = new AccessToken(apiKey, apiSecret, {
        identity: participantIdentity,
        metadata: participantMetadata,
        name: participantName,
        ttl: "15m",
      });

      at.addGrant({
        canPublish: true,
        canPublishData: true,
        canSubscribe: true,
        room: roomName,
        roomJoin: true,
      });

      if (agentName) {
        at.roomConfig = new RoomConfiguration({
          agents: [new RoomAgentDispatch({ agentName })],
        });
      }

      const participantToken = await at.toJwt();

      return c.json({ isReconnect, participantName, participantToken, roomName, serverUrl }, 200);
    } catch (error) {
      return c.json(
        {
          detail: error instanceof Error ? error.message : "Unknown error",
          error: "Failed to sign LiveKit token.",
        },
        500,
      );
    }
  })
  .get("/:id/resolve", async (c) => {
    const id = c.req.param("id");
    const entry = await loadScheduleEntriesForRedirect(id);

    if (!entry) {
      return c.json({ error: "Interview not available." }, 404);
    }

    return c.json({ interviewId: id, roundId: entry.id }, 200);
  })
  .get("/:id/:roundId", async (c) => {
    const id = c.req.param("id");
    const roundId = c.req.param("roundId");
    const interviewRecord = await loadCandidateInterviewRecord(id, roundId);

    if (!interviewRecord) {
      return c.json({ error: "Interview not available." }, 404);
    }

    return c.json(interviewRecord, 200);
  })
  .get("/:id/:roundId/forms", async (c) => {
    const id = c.req.param("id");
    const roundId = c.req.param("roundId");
    const interviewRecord = await loadCandidateInterviewRecord(id, roundId);

    if (!interviewRecord) {
      return c.json({ error: "Interview not available." }, 404);
    }

    const contextSnapshot = await loadActiveInterviewContextSnapshot(id);
    if (!contextSnapshot) {
      return c.json({ error: "Interview not available." }, 404);
    }
    const required = contextSnapshot.payload.forms.map((form) => ({
      snapshot: form.snapshot,
      templateId: form.templateId,
      version: form.version,
      versionId: form.versionId,
    }));

    if (required.length === 0) {
      return c.json({ required: [], submitted: {} as Record<string, true> }, 200);
    }

    const templateIds = required.map((form) => form.templateId);
    const submittedIds = await loadSubmittedTemplateIds(id, templateIds);

    const submitted: Record<string, true> = {};
    for (const templateId of submittedIds) {
      submitted[templateId] = true;
    }

    return c.json({ required, submitted }, 200);
  })
  .post(
    "/:id/:roundId/forms/:templateId/submit",
    zValidator(
      "json",
      // 中文：answers 形状由 templateVersion 动态决定，这里只做粗校验。
      // English: answers shape is dynamic per templateVersion — only shallow check here.
      z.object({ answers: z.record(z.string(), z.unknown()), versionId: z.string().min(1) }),
      jsonValidatorError("请求参数缺失。"),
    ),
    async (c) => {
      const id = c.req.param("id");
      const roundId = c.req.param("roundId");
      const templateId = c.req.param("templateId");

      const interviewRecord = await loadCandidateInterviewRecord(id, roundId);
      if (!interviewRecord) {
        return c.json({ error: "Interview not available." }, 404);
      }
      if (interviewRecord.currentRoundStatus === "completed") {
        return c.json({ error: "当前面试轮次已结束，无法再提交面试表单。" }, 403);
      }

      const { versionId, answers: rawAnswers } = c.req.valid("json");

      const contextSnapshot = await loadActiveInterviewContextSnapshot(id);
      if (!contextSnapshot) {
        return c.json({ error: "Interview not available." }, 404);
      }
      const requiredForm = contextSnapshot.payload.forms.find(
        (form) => form.templateId === templateId,
      );
      if (!requiredForm) {
        return c.json({ error: "该面试表单不适用于当前面试。" }, 400);
      }
      if (requiredForm.versionId !== versionId) {
        return c.json({ error: "面试表单版本已过期，请刷新页面后重试。" }, 409);
      }

      const answersSchema = buildCandidateFormAnswersSchema(requiredForm.snapshot);
      const parsed = answersSchema.safeParse(rawAnswers);
      if (!parsed.success) {
        return c.json({ error: parsed.error.issues[0]?.message ?? "面试表单填写不完整。" }, 400);
      }

      const now = new Date();
      const submissionId = crypto.randomUUID();
      try {
        await db.insert(candidateFormSubmission).values({
          answers: parsed.data,
          id: submissionId,
          interviewRecordId: id,
          organizationId: interviewRecord.organizationId,
          submittedAt: now,
          templateId,
          versionId,
        });
      } catch {
        // Unique (templateId, interviewRecordId) — treat as already submitted.
        return c.json({ error: "该面试表单已提交过。" }, 409);
      }

      return c.json({ submissionId, success: true, version: requiredForm.version, versionId }, 200);
    },
  )
  .post(
    "/:id/:roundId/complete",
    zValidator("query", z.object({ mode: z.enum(["interrupt", "final"]).optional() })),
    async (c) => {
      // 浏览器侧发出的「会话状态变更」信号，按 mode 区分：
      //   mode=interrupt（默认）：候选人断连。把状态置为 interrupted 并写入
      //     首次断开时间，开启 3 分钟热重连窗口；不级联面试整体状态。
      //   mode=final：候选人主动结束（保留接口未来扩展）。立刻置 completed
      //     并级联面试整体状态，与 /api/agent/report 的写入路径保持兼容。
      // Agent grace 超时后由 shutdown 回调走 /api/agent/report 把轮次最终
      // 落到 completed，因此 interrupt 不需要做任何兜底「结束」工作。
      //
      // Browser-side session-state signal. mode=interrupt (default) marks the
      // round "interrupted" with disconnectedAt to open the 3-minute rejoin
      // window; mode=final retains the original cascade-to-completed semantics
      // for any future "leave interview" button. Final completion is normally
      // driven by /api/agent/report after the agent's grace timer fires.
      const roundId = c.req.param("roundId");
      const mode = c.req.valid("query").mode === "final" ? "final" : "interrupt";
      const now = new Date();

      const [entry] = await db
        .select({
          disconnectedAt: studioInterviewSchedule.disconnectedAt,
          id: studioInterviewSchedule.id,
          interviewRecordId: studioInterviewSchedule.interviewRecordId,
          status: studioInterviewSchedule.status,
        })
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.id, roundId))
        .limit(1);

      if (!entry) {
        return c.json({ error: "Round not found." }, 404);
      }

      if (entry.status === "completed") {
        return c.json({ success: true }, 200);
      }

      if (mode === "interrupt") {
        // 每次断连都覆盖 disconnectedAt = now，让 3 分钟宽限窗口与 agent 端的
        // grace 计时器（每次 participant_disconnected 重启）保持同步。
        // 之前"只在首次写"的策略会让多次断连时两端窗口错位 —— 例如用户首次断
        // 30 秒后重连，又过 60 秒再次断开，agent 重启 grace 等 180 秒，但 web
        // 仍按首次断的时间算（剩余 90 秒）就会过早判 410。
        // pending 没有 anchor 不能重连，忽略；completed 已结束，忽略。
        // Always overwrite disconnectedAt = now on every drop so the web grace
        // window stays in lockstep with agent's grace timer (which restarts on
        // each participant_disconnected). The earlier "first-drop only" rule
        // caused the two windows to drift apart on multiple reconnects.
        if (entry.status === "in_progress" || entry.status === "interrupted") {
          await db
            .update(studioInterviewSchedule)
            .set({
              disconnectedAt: now,
              status: "interrupted" as const,
              updatedAt: now,
            })
            .where(eq(studioInterviewSchedule.id, roundId));
          // 候选人侧路由没有 activeOrg，反查 interview record 拿 orgId。
          // 找不到时跳过失效（约定见 cache-tags.ts），等 cacheLife 自然过期。
          // Candidate-side route has no activeOrg; reverse-lookup org from the
          // interview record. Skip invalidation on miss; cacheLife will refresh.
          const orgId = await lookupOrgIdByInterviewRecord(entry.interviewRecordId);
          if (orgId) {
            safeUpdateTag(cacheTags.studioInterviews(orgId));
          }
        }
        return c.json({ success: true }, 200);
      }

      await db.transaction(async (tx) => {
        await tx
          .update(studioInterviewSchedule)
          .set({ status: "completed" as const, updatedAt: now })
          .where(eq(studioInterviewSchedule.id, roundId));

        const pendingRounds = await tx
          .select({ id: studioInterviewSchedule.id })
          .from(studioInterviewSchedule)
          .where(
            and(
              eq(studioInterviewSchedule.interviewRecordId, entry.interviewRecordId),
              ne(studioInterviewSchedule.status, "completed"),
            ),
          );

        // 两个分支跑不同 UPDATE：completed vs 防御性抬到 in_progress；不能 ternary 化。
        // Two different UPDATEs branch here; can't collapse into a ternary.
        // oxlint-disable-next-line unicorn/prefer-ternary
        if (pendingRounds.length === 0) {
          await tx
            .update(studioInterview)
            .set({ status: "completed" as const, updatedAt: now })
            .where(eq(studioInterview.id, entry.interviewRecordId));
        } else {
          // 防御性写入：本轮已结束但仍有未完成轮次。正常路径下 record 在首轮开始
          // 时已置 in_progress；但 agent /report 兜底完成的轮次可能跳过 token 路由，
          // 这里再补一刀，保证 record 不会停留在 ready。
          // Defensive: a round finished but the candidate still has pending
          // rounds. The first-round-start path normally bumps the record to
          // in_progress, but agent-side completions can bypass it; ensure the
          // record can never linger at "ready" once any round has finished.
          await tx
            .update(studioInterview)
            .set({ status: "in_progress" as const, updatedAt: now })
            .where(
              and(
                eq(studioInterview.id, entry.interviewRecordId),
                eq(studioInterview.status, "ready"),
              ),
            );
        }
      });

      // 候选人侧路由没有 activeOrg —— 反查 org 拼 org-scoped tag。
      // Reverse-lookup orgId on the candidate-side path; tag is org-scoped now.
      const completedOrgId = await lookupOrgIdByInterviewRecord(entry.interviewRecordId);
      if (completedOrgId) {
        safeUpdateTag(cacheTags.studioInterviews(completedOrgId));
      }
      return c.json({ success: true }, 200);
    },
  );
