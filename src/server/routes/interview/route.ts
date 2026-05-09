import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ResumeProfile } from "@/lib/interview/types";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { and, eq, ne } from "drizzle-orm";
import { AccessToken } from "livekit-server-sdk";
import { db } from "@/lib/db";
import { candidateFormSubmission, studioInterview, studioInterviewSchedule } from "@/lib/db/schema";
import { buildCandidateFormAnswersSchema } from "@/lib/candidate-forms";
import type { CandidateFormTemplateRecord } from "@/lib/candidate-forms";
import { RECONNECT_GRACE_MS } from "@/lib/studio-interviews";
import {
  streamGenerateInterviewQuestions,
  streamParseResumeProfile,
} from "@/server/agents/resume-analysis-agent";
import { matchJobDescriptionForResume } from "@/server/agents/job-description-match-agent";
import { factory } from "@/server/factory";
import { authMiddleware } from "@/server/middlewares/auth";
import { resumeProfileSchema } from "@/lib/interview/types";
import { listAllJobDescriptions } from "@/server/routes/studio/routes/job-descriptions/dao";
import { getGlobalConfig } from "@/server/routes/studio/routes/global-config/dao";
import {
  loadApplicableCandidateFormTemplates,
  loadCandidateFormTemplateVersionById,
  loadSubmittedTemplateIds,
  resolveOrCreateTemplateVersion,
} from "@/server/routes/studio/routes/forms/dao";
import {
  buildTokenErrorResponse,
  loadCandidateInterviewRecord,
  loadScheduleEntriesForRedirect,
  safeUpdateTag,
} from "./utils";

export const interviewRouter = factory
  .createApp()
  .post("/parse-resume", authMiddleware, async (c) => {
    const formData = await c.req.formData();
    const resume = formData.get("resume");

    if (!(resume instanceof File)) {
      return c.json({ error: "缺少简历 PDF 文件。" }, 400);
    }

    try {
      const stream = streamParseResumeProfile(resume);
      return new Response(stream, {
        headers: {
          "Cache-Control": "no-cache",
          "Content-Type": "application/x-ndjson",
          "Transfer-Encoding": "chunked",
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        const status = error.message.includes("PDF") || error.message.includes("10 MB") ? 400 : 500;
        return c.json(
          { error: error.message, stage: "resume-parsing" },
          status as ContentfulStatusCode,
        );
      }

      return c.json({ error: "Failed to parse resume.", stage: "resume-parsing" }, 500);
    }
  })
  .post("/match-job-description", async (c) => {
    const body = await c.req
      .json<{ resumeProfile?: unknown }>()
      .catch(() => ({}) as { resumeProfile?: unknown });

    const profileInput = resumeProfileSchema.safeParse(body.resumeProfile);
    if (!profileInput.success) {
      return c.json({ error: "缺少候选人信息 (resumeProfile)。" }, 400);
    }

    try {
      const jobDescriptions = await listAllJobDescriptions();
      if (jobDescriptions.length === 0) {
        return c.json({ matchedId: null, reason: null });
      }

      const match = await matchJobDescriptionForResume(profileInput.data, jobDescriptions);
      if (!match) {
        return c.json({ matchedId: null, reason: null });
      }

      return c.json({ matchedId: match.jobDescriptionId, reason: match.reason });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "在招岗位匹配失败。" }, 500);
    }
  })
  .post("/generate-questions", async (c) => {
    const body = await c.req
      .json<{ resumeProfile?: unknown }>()
      .catch(() => ({}) as { resumeProfile?: unknown });

    if (!body.resumeProfile || typeof body.resumeProfile !== "object") {
      return c.json({ error: "缺少候选人信息 (resumeProfile)。" }, 400);
    }

    const stream = streamGenerateInterviewQuestions(body.resumeProfile as ResumeProfile);

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
      },
    });
  })
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

    const applicable = await loadApplicableCandidateFormTemplates(id);
    const requiredTemplateIds = [...applicable.global, ...applicable.jobSpecific].map((t) => t.id);
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
    // 全局配置（公司背景、开场/结束指令）在颁发 token 前读取并注入。
    // Global config (company context, opening/closing instructions) is read before token issuance and injected here.
    const globalCfg = await getGlobalConfig();
    // 录像开关：S3 凭据齐全才让 Agent 启动 Egress；候选人浏览器拒绝摄像头时
    // 由前端在 /api/interview/.../recording-skipped 之类的通道反馈（这里只判服务端能力）。
    // Recording switch: only enable when S3 creds are present so the agent can write to storage.
    const recordingEnabled = Boolean(
      process.env.S3_BUCKET_NAME &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY,
    );
    const recordingFileKey = recordingEnabled
      ? `${(process.env.S3_KEY_PREFIX ?? "").replace(/\/+$/, "")}/interviews/${id}/${roundId}/${roomName}.mp4`.replace(
          /^\/+/,
          "",
        )
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
      target_role: interviewRecord.targetRole,
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

      return c.json({
        isReconnect,
        participantName,
        participantToken,
        roomName,
        serverUrl,
      });
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

    return c.json({ interviewId: id, roundId: entry.id });
  })
  .get("/:id/:roundId", async (c) => {
    const id = c.req.param("id");
    const roundId = c.req.param("roundId");
    const interviewRecord = await loadCandidateInterviewRecord(id, roundId);

    if (!interviewRecord) {
      return c.json({ error: "Interview not available." }, 404);
    }

    return c.json(interviewRecord);
  })
  .get("/:id/:roundId/forms", async (c) => {
    const id = c.req.param("id");
    const roundId = c.req.param("roundId");
    const interviewRecord = await loadCandidateInterviewRecord(id, roundId);

    if (!interviewRecord) {
      return c.json({ error: "Interview not available." }, 404);
    }

    const applicable = await loadApplicableCandidateFormTemplates(id);
    const templates: CandidateFormTemplateRecord[] = [
      ...applicable.global,
      ...applicable.jobSpecific,
    ];

    if (templates.length === 0) {
      return c.json({ required: [], submitted: {} });
    }

    const templateIds = templates.map((t) => t.id);
    const submittedIds = await loadSubmittedTemplateIds(id, templateIds);

    // Resolve (or lazily create) the current version for each applicable
    // template. Performed inside one transaction so concurrent candidates
    // converge on the same version rows.
    const required = await db.transaction(async (tx) => {
      const out: {
        templateId: string;
        versionId: string;
        version: number;
        snapshot: unknown;
      }[] = [];
      for (const template of templates) {
        const resolved = await resolveOrCreateTemplateVersion(tx, template.id);
        out.push({
          snapshot: resolved.snapshot,
          templateId: template.id,
          version: resolved.version,
          versionId: resolved.id,
        });
      }
      return out;
    });

    const submitted: Record<string, true> = {};
    for (const templateId of submittedIds) {
      submitted[templateId] = true;
    }

    return c.json({ required, submitted });
  })
  .post("/:id/:roundId/forms/:templateId/submit", async (c) => {
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

    const body = (await c.req.json().catch(() => null)) as {
      versionId?: unknown;
      answers?: unknown;
    } | null;
    if (
      !body ||
      typeof body.versionId !== "string" ||
      body.answers === null ||
      typeof body.answers !== "object"
    ) {
      return c.json({ error: "请求参数缺失。" }, 400);
    }
    const { versionId } = body;
    const rawAnswers = body.answers as Record<string, unknown>;

    const applicable = await loadApplicableCandidateFormTemplates(id);
    const applicableIds = new Set(
      [...applicable.global, ...applicable.jobSpecific].map((t) => t.id),
    );
    if (!applicableIds.has(templateId)) {
      return c.json({ error: "该面试表单不适用于当前面试。" }, 400);
    }

    const version = await loadCandidateFormTemplateVersionById(templateId, versionId);
    if (!version) {
      return c.json({ error: "面试表单版本不存在。" }, 400);
    }

    const answersSchema = buildCandidateFormAnswersSchema(version.snapshot);
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
        submittedAt: now,
        templateId,
        versionId,
      });
    } catch {
      // Unique (templateId, interviewRecordId) — treat as already submitted.
      return c.json({ error: "该面试表单已提交过。" }, 409);
    }

    return c.json({
      submissionId,
      success: true,
      version: version.version,
      versionId,
    });
  })
  .post("/:id/:roundId/complete", async (c) => {
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
    const mode = c.req.query("mode") === "final" ? "final" : "interrupt";
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
      return c.json({ success: true });
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
        safeUpdateTag("studio-interviews");
      }
      return c.json({ success: true });
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

      if (pendingRounds.length === 0) {
        await tx
          .update(studioInterview)
          .set({ status: "completed" as const, updatedAt: now })
          .where(eq(studioInterview.id, entry.interviewRecordId));
      }
    });

    safeUpdateTag("studio-interviews");
    return c.json({ success: true });
  });
