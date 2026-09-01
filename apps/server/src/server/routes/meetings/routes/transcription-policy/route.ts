import { zValidator } from "@hono/zod-validator";
import { updateMeetingTranscriptionPolicySchema } from "@arc/shared/meeting-transcription";
import { factory, jsonValidatorError } from "../../../../factory";
import {
  getWorkspaceMeetingTranscriptionPolicy,
  updateWorkspaceMeetingTranscriptionPolicy,
} from "../../transcription/service";

export const meetingTranscriptionPolicyRouter = factory
  .createApp()
  .get("/", async (c) => {
    const { activeOrg, member, user } = c.var;
    if (!(activeOrg && member && user)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const policy = await getWorkspaceMeetingTranscriptionPolicy({
      memberRole: member.role,
      organizationId: activeOrg.id,
    });
    return c.json(policy, 200);
  })
  .put(
    "/",
    zValidator(
      "json",
      updateMeetingTranscriptionPolicySchema,
      jsonValidatorError("转录 provider policy 无效"),
    ),
    async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!(activeOrg && member && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const result = await updateWorkspaceMeetingTranscriptionPolicy({
        memberRole: member.role,
        organizationId: activeOrg.id,
        policy: c.req.valid("json"),
        userId: user.id,
      });
      if (result === "forbidden") {
        return c.json({ error: "只有 Workspace Administrator 可以修改转录策略" }, 403);
      }
      if (result === "invalid-provider") {
        return c.json({ error: "所选转录 provider 未在当前部署启用" }, 400);
      }
      return c.json(result, 200);
    },
  );
