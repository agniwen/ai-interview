import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { resolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import {
  queryInterviewConversationReportByRound,
  queryInterviewConversationReportsByRound,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-conversations";
import { resolveCandidateIdForRound } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds";

export const reportsRouter = factory
  .createApp()
  .get("/", requirePermission("interview", "read"), async (c) => {
    // `:id` 为 roundId；报告按 scheduleEntryId 过滤，仅返回当前轮次的 conversations。
    // `:id` is roundId; reports are filtered by scheduleEntryId (per-round, not per-candidate).
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const roundId = c.req.param("id");
    if (!roundId) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    // 通过解析 candidateId 来验证 org 归属（不存在则 404）。
    // Validate org scope by resolving the candidate (handles 404).
    const visibilityScope = c.var.user?.id
      ? await resolveRecruitingVisibilityScope({
          currentRole: c.var.member?.role,
          organizationId: activeOrg.id,
          userId: c.var.user.id,
        })
      : { kind: "none" as const };
    const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id, visibilityScope);
    if (!candidateId) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const reports = await queryInterviewConversationReportsByRound(roundId, {
      includeSnapshotMetadata: true,
    });
    return c.json(reports, 200);
  })
  .get("/:conversationId", requirePermission("interview", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const roundId = c.req.param("id");
    const conversationId = c.req.param("conversationId");
    if (!(roundId && conversationId)) {
      return c.json({ error: "面试记录不存在。" }, 404);
    }
    const visibilityScope = c.var.user?.id
      ? await resolveRecruitingVisibilityScope({
          currentRole: c.var.member?.role,
          organizationId: activeOrg.id,
          userId: c.var.user.id,
        })
      : { kind: "none" as const };
    const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id, visibilityScope);
    if (!candidateId) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const report = await queryInterviewConversationReportByRound(roundId, conversationId, {
      includeSnapshotMetadata: true,
    });
    if (!report) {
      return c.json({ error: "面试记录不存在。" }, 404);
    }
    return c.json(report, 200);
  });
