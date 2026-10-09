import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { manualHumanEmailTypeSchema } from "@app/shared/manual-human-email";
import { factory, jsonValidatorError } from "../../../../../../factory";
import { resolveRecruitingVisibilityScope } from "../../../../../../access/recruiting-visibility";
import { requirePermission } from "../../../../../../middlewares/permission";
import { ManualInvitationError } from "./application/default-manual-ai-invitation";
import { previewManualHumanEmail, confirmManualHumanEmail } from "./application/manual-human-email";

const defaults = {
  confirm: confirmManualHumanEmail,
  preview: previewManualHumanEmail,
  requireResumeRead: requirePermission("resumeLibrary", "read"),
  requireUpdate: requirePermission("humanInterview", "update"),
  visibility: resolveRecruitingVisibilityScope,
};
const params = z.object({ meetingId: z.uuid(), roundId: z.uuid() });

export function createManualHumanEmailRouter(overrides: Partial<typeof defaults> = {}) {
  const dependencies = { ...defaults, ...overrides };
  return factory
    .createApp()
    .use("*", dependencies.requireResumeRead, dependencies.requireUpdate)
    .get(
      "/:meetingId/:roundId/preview",
      zValidator("param", params, jsonValidatorError("面试参数无效")),
      async (c) => {
        c.header("Cache-Control", "no-store");
        const { activeOrg, user, member } = c.var;
        if (!activeOrg || !user) {
          return c.json({ error: "请先登录。" }, 401);
        }
        const visibility = await dependencies.visibility({
          currentRole: member?.role,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        try {
          return c.json(
            await dependencies.preview({
              ...c.req.valid("param"),
              actorUserId: user.id,
              organizationId: activeOrg.id,
              visibility,
            }),
            200,
          );
        } catch (error) {
          if (error instanceof ManualInvitationError) {
            return c.json({ error: error.message }, error.status);
          }
          throw error;
        }
      },
    )
    .post(
      "/:meetingId/:roundId/confirm",
      zValidator("param", params, jsonValidatorError("面试参数无效")),
      zValidator(
        "json",
        z.object({
          confirmationToken: z.string().min(1).max(4096),
          confirmed: z.literal(true),
          type: manualHumanEmailTypeSchema,
        }),
        jsonValidatorError("请选择通知类型并确认发送"),
      ),
      async (c) => {
        const { activeOrg, user, member } = c.var;
        if (!activeOrg || !user) {
          return c.json({ error: "请先登录。" }, 401);
        }
        const visibility = await dependencies.visibility({
          currentRole: member?.role,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        const body = c.req.valid("json");
        try {
          return c.json(
            await dependencies.confirm(
              {
                ...c.req.valid("param"),
                actorUserId: user.id,
                organizationId: activeOrg.id,
                visibility,
              },
              body.type,
              body.confirmationToken,
            ),
            202,
          );
        } catch (error) {
          if (error instanceof ManualInvitationError) {
            return c.json({ error: error.message }, error.status);
          }
          throw error;
        }
      },
    );
}
