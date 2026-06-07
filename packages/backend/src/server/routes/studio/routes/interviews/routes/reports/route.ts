import { factory } from "@arc/backend/server/factory";
import { requirePermission } from "@arc/backend/server/middlewares/permission";
import { queryInterviewConversationReportsByRound } from "@arc/backend/server/routes/studio/routes/interviews/dao/interview-conversations";
import { resolveCandidateIdForRound } from "@arc/backend/server/routes/studio/routes/interviews/dao/interview-rounds";

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
    const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id);
    if (!candidateId) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const reports = await queryInterviewConversationReportsByRound(roundId);
    return c.json(reports, 200);
  });
