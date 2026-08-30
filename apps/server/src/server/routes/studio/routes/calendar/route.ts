import { zValidator } from "@hono/zod-validator";
import { resolveRecruitingVisibilityScope } from "@app/server/server/access/recruiting-visibility";
import { factory, jsonValidatorError } from "@app/server/server/factory";
import { requirePermission } from "@app/server/server/middlewares/permission";
import { listStudioCalendarEvents, loadAiCalendarEventPreview } from "./dao";
import { studioAiCalendarPreviewQuerySchema, studioCalendarQuerySchema } from "./schema";

export interface StudioCalendarRouterDependencies {
  listEvents: typeof listStudioCalendarEvents;
  loadPreview: typeof loadAiCalendarEventPreview;
  requirePermission: typeof requirePermission;
  resolveVisibility: typeof resolveRecruitingVisibilityScope;
}

const defaultDependencies: StudioCalendarRouterDependencies = {
  listEvents: listStudioCalendarEvents,
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
          visibilityScope,
        });
        return c.json({ events }, 200);
      },
    );
}

export const studioCalendarRouter = createStudioCalendarRouter();
