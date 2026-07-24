import { zValidator } from "@hono/zod-validator";
import { resolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import { listStudioCalendarEvents } from "./dao";
import { studioCalendarQuerySchema } from "./schema";

export const studioCalendarRouter = factory
  .createApp()
  .get(
    "/",
    requirePermission("interview", "read"),
    zValidator("query", studioCalendarQuerySchema, jsonValidatorError("日程查询参数无效。")),
    async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }

      const query = c.req.valid("query");
      const visibilityScope = await resolveRecruitingVisibilityScope({
        currentRole: member?.role,
        organizationId: activeOrg.id,
        userId: user.id,
      });
      const events = await listStudioCalendarEvents({
        end: new Date(query.end),
        organizationId: activeOrg.id,
        start: new Date(query.start),
        visibilityScope,
      });
      return c.json({ events }, 200);
    },
  );
