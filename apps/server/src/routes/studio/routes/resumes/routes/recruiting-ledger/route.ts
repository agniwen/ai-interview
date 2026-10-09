import { parseCsvParam } from "@app/shared/csv";
import { hrStatisticsQuerySchema } from "@app/shared/recruiting-hr-statistics";
import {
  parseRecruitingLedgerJobStatuses,
  parseRecruitingLedgerRecommendationLevels,
  recruitingLedgerInformationSyncInputSchema,
  recruitingLedgerQuerySchema,
} from "@app/shared/studio-recruiting-ledger";
import { zValidator } from "@hono/zod-validator";
import {
  nextShanghaiCalendarDayStart,
  shanghaiCalendarDayStart,
} from "@app/shared/date-range-filter";
import { resolveRecruitingVisibilityScope } from "../../../../../../access/recruiting-visibility";
import { factory, jsonValidatorError } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";
import {
  queryRecruitingLedger,
  setRecruitingLedgerInformationSync,
} from "../../dao/recruiting-ledger";
import { loadHrStatistics } from "../../dao/hr-statistics";

export interface RecruitingLedgerRouterDependencies {
  loadHrStatistics?: typeof loadHrStatistics;
  queryRecruitingLedger: typeof queryRecruitingLedger;
  requirePermission: typeof requirePermission;
  resolveRecruitingVisibilityScope: typeof resolveRecruitingVisibilityScope;
  setRecruitingLedgerInformationSync: typeof setRecruitingLedgerInformationSync;
}

const defaultDependencies: RecruitingLedgerRouterDependencies = {
  queryRecruitingLedger,
  requirePermission,
  resolveRecruitingVisibilityScope,
  setRecruitingLedgerInformationSync,
};

export function createRecruitingLedgerRouter(
  dependencies: RecruitingLedgerRouterDependencies = defaultDependencies,
) {
  return factory
    .createApp()
    .get(
      "/hr-statistics",
      dependencies.requirePermission("page", "recruitingLedger"),
      dependencies.requirePermission("resumeLibrary", "read"),
      zValidator("query", hrStatisticsQuerySchema, jsonValidatorError("查询参数无效。")),
      async (c) => {
        const { activeOrg } = c.var;
        if (!activeOrg || !c.var.user?.id) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const q = c.req.valid("query");
        const visibility = await dependencies.resolveRecruitingVisibilityScope({
          currentRole: c.var.member?.role,
          organizationId: activeOrg.id,
          userId: c.var.user.id,
        });
        const result = await (dependencies.loadHrStatistics ?? loadHrStatistics)(
          {
            departmentIds: parseCsvParam(q.departmentIds),
            from: q.from,
            jobIds: parseCsvParam(q.jdIds),
            organizationId: activeOrg.id,
            period: q.period,
            responsibleHrIds: parseCsvParam(q.responsibleHrIds),
            to: q.to,
          },
          visibility,
        );
        return c.json(result, 200);
      },
    )
    .get(
      "/",
      dependencies.requirePermission("page", "recruitingLedger"),
      dependencies.requirePermission("resumeLibrary", "read"),
      zValidator("query", recruitingLedgerQuerySchema, jsonValidatorError("查询参数无效。")),
      async (c) => {
        const { activeOrg } = c.var;
        if (!activeOrg || !c.var.user?.id) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const q = c.req.valid("query");
        const visibilityScope = await dependencies.resolveRecruitingVisibilityScope({
          currentRole: c.var.member?.role,
          organizationId: activeOrg.id,
          userId: c.var.user.id,
        });
        const result = await dependencies.queryRecruitingLedger(
          activeOrg.id,
          {
            boardView: q.boardView,
            createdAtBefore: q.createdTo ? nextShanghaiCalendarDayStart(q.createdTo) : undefined,
            createdAtFrom: q.createdFrom ? shanghaiCalendarDayStart(q.createdFrom) : undefined,
            departmentIds: parseCsvParam(q.departmentIds),
            jobDescriptionIds: parseCsvParam(q.jdIds),
            joiningDateFrom: q.joiningFrom,
            joiningDateTo: q.joiningTo,
            recommendationLevels: parseRecruitingLedgerRecommendationLevels(q.recommendationLevels),
            recruitingStatuses: parseRecruitingLedgerJobStatuses(q.recruitingStatuses),
            responsibleHrIds: parseCsvParam(q.responsibleHrIds),
            search: q.search,
          },
          {
            page: q.page,
            pageSize: q.pageSize,
            sortBy: q.sortBy,
            sortOrder: q.sortOrder,
          },
          visibilityScope,
        );
        return c.json(result, 200);
      },
    )
    .patch(
      "/:recordId/information-sync",
      dependencies.requirePermission("page", "recruitingLedger"),
      dependencies.requirePermission("resumeLibrary", "update"),
      zValidator(
        "json",
        recruitingLedgerInformationSyncInputSchema,
        jsonValidatorError("输入无效。"),
      ),
      async (c) => {
        const { activeOrg } = c.var;
        const userId = c.var.user?.id;
        if (!(activeOrg && userId)) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const scope = await dependencies.resolveRecruitingVisibilityScope({
          currentRole: c.var.member?.role,
          organizationId: activeOrg.id,
          userId,
        });
        const result = await dependencies.setRecruitingLedgerInformationSync({
          operatorId: userId,
          organizationId: activeOrg.id,
          recordId: c.req.param("recordId"),
          scope,
          synced: c.req.valid("json").synced,
        });
        return result ? c.json(result, 200) : c.json({ message: "Not Found" }, 404);
      },
    );
}

export const recruitingLedgerRouter = createRecruitingLedgerRouter();
