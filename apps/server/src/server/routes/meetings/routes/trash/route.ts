import { zValidator } from "@hono/zod-validator";
import { trashedMeetingListQuerySchema } from "@arc/shared/meeting-recording";
import { factory, jsonValidatorError } from "../../../../factory";
import { listTrashedSavedMeetings } from "../../lifecycle-service";

export function createMeetingTrashRouter(
  listTrashed: typeof listTrashedSavedMeetings = listTrashedSavedMeetings,
) {
  return factory
    .createApp()
    .get(
      "/",
      zValidator("query", trashedMeetingListQuerySchema, jsonValidatorError("分页参数无效")),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!(activeOrg && user)) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const query = c.req.valid("query");
        const result = await listTrashed({
          actorId: user.id,
          organizationId: activeOrg.id,
          ...query,
        });
        return c.json(result, 200);
      },
    );
}

export const meetingTrashRouter = createMeetingTrashRouter();
