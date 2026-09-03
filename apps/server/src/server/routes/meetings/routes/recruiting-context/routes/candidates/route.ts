import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createRequestWorkspaceAuthorizer } from "../../../../../../access/workspace-access-policy";
import { getWorkspaceRequestContext } from "../../../../../../context/workspace-request-context";
import { factory, jsonValidatorError } from "../../../../../../factory";
import { getMeetingRecruitingRecordCandidates } from "../../../../recruiting-context-service";

export const meetingRecruitingContextCandidatesRouter = factory.createApp().get(
  "/",
  zValidator(
    "query",
    z.object({
      limit: z.coerce.number().int().min(1).max(50).default(20),
      search: z.string().trim().max(200).optional(),
    }),
    jsonValidatorError("查询参数无效"),
  ),
  async (c) => {
    const meetingId = c.req.param("id");
    if (!meetingId) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    const { member, organization, user } = getWorkspaceRequestContext(c);
    const authorize = createRequestWorkspaceAuthorizer({
      headers: c.req.raw.headers,
      memberRole: member.role,
      organizationId: organization.id,
      userId: user.id,
    });
    const result = await getMeetingRecruitingRecordCandidates({
      canReadRecruitingRecords: await authorize({ action: "read", resource: "resumeLibrary" }),
      limit: c.req.valid("query").limit,
      meetingId,
      memberRole: member.role,
      organizationId: organization.id,
      search: c.req.valid("query").search,
      userId: user.id,
    });
    if (result === null) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    if (result === "forbidden") {
      return c.json({ error: "无权选择招聘记录" }, 403);
    }
    return c.json({ records: result }, 200);
  },
);
