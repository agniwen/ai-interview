import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { listTrashedSavedMeetings } from "../../lifecycle-service";

export const meetingTrashRouter = factory.createApp().get("/", async (c) => {
  const { activeOrg, user } = c.var;
  if (!(activeOrg && user)) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  const records = await listTrashedSavedMeetings({
    actorId: user.id,
    organizationId: activeOrg.id,
  });
  return c.json({ records }, 200);
});
