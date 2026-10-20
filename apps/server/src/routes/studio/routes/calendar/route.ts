import { zValidator } from "@hono/zod-validator";
import { resolveRecruitingVisibilityScope } from "@app/resume-processing/review/support/access-recruiting-visibility";
import { factory, jsonValidatorError } from "../../../../factory";
import { requirePermission } from "../../../../middlewares/permission";
import { listStudioCalendarEvents, loadAiCalendarEventPreview } from "./dao";
import { loadAiRoundEvaluation, loadHumanRoundEvaluation } from "./evaluation-dao";
import { studioAiCalendarPreviewQuerySchema, studioCalendarQuerySchema } from "./schema";

export interface StudioCalendarRouterDependencies {
  listEvents: typeof listStudioCalendarEvents;
  loadAiEvaluation: typeof loadAiRoundEvaluation;
  loadHumanEvaluation: typeof loadHumanRoundEvaluation;
  loadPreview: typeof loadAiCalendarEventPreview;
  requirePermission: typeof requirePermission;
  resolveVisibility: typeof resolveRecruitingVisibilityScope;
}

const defaultDependencies: StudioCalendarRouterDependencies = {
  listEvents: listStudioCalendarEvents,
  loadAiEvaluation: loadAiRoundEvaluation,
  loadHumanEvaluation: loadHumanRoundEvaluation,
  loadPreview: loadAiCalendarEventPreview,
  requirePermission,
  resolveVisibility: resolveRecruitingVisibilityScope,
};

export function createStudioCalendarRouter(
  dependencies: StudioCalendarRouterDependencies = defaultDependencies,
) {
  return factory
    .createApp()
    .get(
      "/ai-events/:roundId/evaluation",
      dependencies.requirePermission("interview", "read"),
      async (c) => {
        const { activeOrg, member, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const visibilityScope = await dependencies.resolveVisibility({
          currentRole: member?.role,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        const evaluation = await dependencies.loadAiEvaluation({
          organizationId: activeOrg.id,
          roundId: c.req.param("roundId"),
          visibilityScope,
        });
        if (!evaluation) {
          return c.json({ error: "面试轮次不存在。" }, 404);
        }
        return c.json(evaluation, 200);
      },
    )
    .get(
      "/human-events/:roundId/evaluation",
      dependencies.requirePermission("interview", "read"),
      async (c) => {
        const { activeOrg, member, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const visibilityScope = await dependencies.resolveVisibility({
          currentRole: member?.role,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        const evaluation = await dependencies.loadHumanEvaluation({
          organizationId: activeOrg.id,
          roundId: c.req.param("roundId"),
          viewerUserId: user.id,
          visibilityScope,
        });
        if (!evaluation) {
          return c.json({ error: "面试轮次不存在。" }, 404);
        }
        return c.json(evaluation, 200);
      },
    )
    .get(
      "/ai-events/:roundId/preview",
      dependencies.requirePermission("interview", "read"),
      zValidator("query", studioAiCalendarPreviewQuerySchema, jsonValidatorError("预览参数无效。")),
      async (c) => {
        const { activeOrg, member, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const roundId = c.req.param("roundId");
        const { conversationId } = c.req.valid("query");
        const visibilityScope = await dependencies.resolveVisibility({
          currentRole: member?.role,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        const preview = await dependencies.loadPreview({
          conversationId,
          organizationId: activeOrg.id,
          roundId,
          visibilityScope,
        });
        if (!preview) {
          return c.json({ error: "AI 面试事件不存在。" }, 404);
        }
        return c.json(preview, 200);
      },
    )
    .get(
      "/",
      dependencies.requirePermission("interview", "read"),
      zValidator("query", studioCalendarQuerySchema, jsonValidatorError("日程查询参数无效。")),
      async (c) => {
        const { activeOrg, member, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }

        const query = c.req.valid("query");
        const visibilityScope = await dependencies.resolveVisibility({
          currentRole: member?.role,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        const events = await dependencies.listEvents({
          end: new Date(query.end),
          organizationId: activeOrg.id,
          start: new Date(query.start),
          viewerUserId: user.id,
          visibilityScope,
        });
        return c.json({ events }, 200);
      },
    );
}

export const studioCalendarRouter = createStudioCalendarRouter();
