import { factory } from "@app/server/server/factory";
import { resolveRecruitingVisibilityScope } from "@app/server/server/access/recruiting-visibility";
import { requirePermission } from "@app/server/server/middlewares/permission";
import {
  queryInterviewConversationReportByRound,
  queryInterviewConversationReportsByRound,
} from "@app/server/server/routes/studio/routes/interviews/dao/interview-conversations";
import { resolveCandidateIdForRound } from "@app/server/server/routes/studio/routes/interviews/dao/interview-rounds";

export interface ReportsRouterDependencies {
  queryReport: typeof queryInterviewConversationReportByRound;
  queryReports: typeof queryInterviewConversationReportsByRound;
  requireReadPermission: ReturnType<typeof requirePermission<"interview">>;
  resolveCandidateId: typeof resolveCandidateIdForRound;
  resolveVisibility: typeof resolveRecruitingVisibilityScope;
}

const defaultDependencies: ReportsRouterDependencies = {
  queryReport: queryInterviewConversationReportByRound,
  queryReports: queryInterviewConversationReportsByRound,
  requireReadPermission: requirePermission("interview", "read"),
  resolveCandidateId: resolveCandidateIdForRound,
  resolveVisibility: resolveRecruitingVisibilityScope,
};

export function createReportsRouter(overrides: Partial<ReportsRouterDependencies> = {}) {
  const dependencies: ReportsRouterDependencies = { ...defaultDependencies, ...overrides };
  return factory
    .createApp()
    .get("/", dependencies.requireReadPermission, async (c) => {
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
        ? await dependencies.resolveVisibility({
            currentRole: c.var.member?.role,
            organizationId: activeOrg.id,
            userId: c.var.user.id,
          })
        : { kind: "none" as const };
      const candidateId = await dependencies.resolveCandidateId(
        roundId,
        activeOrg.id,
        visibilityScope,
      );
      if (!candidateId) {
        return c.json({ error: "记录不存在。" }, 404);
      }
      const reports = await dependencies.queryReports(roundId, {
        includeKeyInformation: true,
        includeSnapshotMetadata: true,
      });
      return c.json(reports, 200);
    })
    .get("/:conversationId", dependencies.requireReadPermission, async (c) => {
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
        ? await dependencies.resolveVisibility({
            currentRole: c.var.member?.role,
            organizationId: activeOrg.id,
            userId: c.var.user.id,
          })
        : { kind: "none" as const };
      const candidateId = await dependencies.resolveCandidateId(
        roundId,
        activeOrg.id,
        visibilityScope,
      );
      if (!candidateId) {
        return c.json({ error: "记录不存在。" }, 404);
      }
      const report = await dependencies.queryReport(roundId, conversationId, {
        includeKeyInformation: true,
        includeSnapshotMetadata: true,
      });
      if (!report) {
        return c.json({ error: "面试记录不存在。" }, 404);
      }
      return c.json(report, 200);
    });
}

export const reportsRouter = createReportsRouter();
