import { zValidator } from "@hono/zod-validator";
import { meetingLibrarySearchQuerySchema } from "@app/shared/meeting-search";
import { factory, jsonValidatorError } from "../../../../factory";
import { searchSavedMeetings } from "./service";

export const meetingSearchRouter = factory
  .createApp()
  .get(
    "/",
    zValidator("query", meetingLibrarySearchQuerySchema, jsonValidatorError("搜索条件无效")),
    async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!(activeOrg && member && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const query = c.req.valid("query");
      const records = await searchSavedMeetings({
        limit: query.limit,
        organizationId: activeOrg.id,
        query: query.q,
        timeZone: query.timeZone,
        userId: user.id,
      });
      return c.json({ records }, 200);
    },
  );
