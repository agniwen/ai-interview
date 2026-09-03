import { zValidator } from "@hono/zod-validator";
import { updateMeetingRecruitingContextSchema } from "@app/shared/meeting-recording";
import { createRequestWorkspaceAuthorizer } from "../../../../access/workspace-access-policy";
import { getWorkspaceRequestContext } from "../../../../context/workspace-request-context";
import { factory, jsonValidatorError } from "../../../../factory";
import {
  changeMeetingRecruitingContext,
  getMeetingRecruitingContext,
} from "../../recruiting-context-service";
import { meetingRecruitingContextCandidatesRouter } from "./routes/candidates/route";

async function recruitingContextRequest(c: {
  req: { raw: Request };
  var: Parameters<typeof getWorkspaceRequestContext>[0]["var"];
}) {
  const { member, organization, user } = getWorkspaceRequestContext(c);
  const authorize = createRequestWorkspaceAuthorizer({
    headers: c.req.raw.headers,
    memberRole: member.role,
    organizationId: organization.id,
    userId: user.id,
  });
  return {
    canReadRecruitingRecords: await authorize({ action: "read", resource: "resumeLibrary" }),
    member,
    organization,
    user,
  };
}

export const meetingRecruitingContextRouter = factory
  .createApp()
  .route("/candidates", meetingRecruitingContextCandidatesRouter)
  .get("/", async (c) => {
    const meetingId = c.req.param("id");
    if (!meetingId) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    const { canReadRecruitingRecords, member, organization, user } =
      await recruitingContextRequest(c);
    const result = await getMeetingRecruitingContext({
      canReadRecruitingRecords,
      meetingId,
      memberRole: member.role,
      organizationId: organization.id,
      userId: user.id,
    });
    return result ? c.json(result, 200) : c.json({ error: "Meeting Session 不存在" }, 404);
  })
  .put(
    "/",
    zValidator("json", updateMeetingRecruitingContextSchema, jsonValidatorError("关联请求无效")),
    async (c) => {
      const meetingId = c.req.param("id");
      if (!meetingId) {
        return c.json({ error: "Meeting Session 不存在" }, 404);
      }
      const { canReadRecruitingRecords, member, organization, user } =
        await recruitingContextRequest(c);
      const result = await changeMeetingRecruitingContext({
        canReadRecruitingRecords,
        meetingId,
        memberRole: member.role,
        organizationId: organization.id,
        recruitingRecordId: c.req.valid("json").recruitingRecordId,
        userId: user.id,
      });
      if (result === null) {
        return c.json({ error: "Meeting Session 不存在" }, 404);
      }
      if (result === "forbidden") {
        return c.json({ error: "无权修改招聘关联" }, 403);
      }
      if (result === "invalid-record") {
        return c.json({ error: "招聘记录不存在或无权访问" }, 404);
      }
      return c.json({ state: result }, 200);
    },
  );
