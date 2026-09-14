import { backgroundCheckEmailInputSchema } from "@app/db-schema/background-check";
import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";
import { invalidateStudioInterviewCaches } from "../../../../../../cache-tags";
import {
  BackgroundCheckError,
  ensureBackgroundCheckCollection,
  getBackgroundCheckCollection,
  getBackgroundCheckEmailPreview,
  sendBackgroundCheckEmail,
} from "../../dao/background-check";
import { recordCandidateActivity } from "../../utils/candidate-activity";

async function recordCreated(
  created: boolean,
  input: { organizationId: string; operatorId: string | null; recordId: string },
) {
  if (!created) {
    return;
  }
  await recordCandidateActivity({
    action: "background_check_collection_created",
    detail: {},
    interviewRecordId: input.recordId,
    operatorId: input.operatorId,
    organizationId: input.organizationId,
  });
}

export const backgroundCheckRouter = factory
  .createApp()
  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Hono error middleware maps domain errors for every endpoint.
  .onError((error, c) => {
    if (error instanceof BackgroundCheckError) {
      return c.json({ error: error.message }, error.status);
    }
    throw error;
  })
  .get("/", requirePermission("offer", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const recordId = c.req.param("id");
    if (!recordId) {
      return c.json({ error: "候选人记录不存在。" }, 404);
    }
    return c.json(await getBackgroundCheckCollection(recordId, activeOrg.id), 200);
  })
  .post("/link", requirePermission("offer", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const recordId = c.req.param("id");
    if (!recordId) {
      return c.json({ error: "候选人记录不存在。" }, 404);
    }
    const operatorId = c.var.user?.id ?? null;
    const result = await ensureBackgroundCheckCollection(recordId, activeOrg.id, operatorId);
    await recordCreated(result.created, { operatorId, organizationId: activeOrg.id, recordId });
    await recordCandidateActivity({
      action: "background_check_link_copied",
      detail: {},
      interviewRecordId: recordId,
      operatorId,
      organizationId: activeOrg.id,
    });
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();
    if (!baseUrl) {
      throw new Error("NEXT_PUBLIC_BASE_URL 未配置");
    }
    return c.json({ url: `${baseUrl.replace(/\/$/, "")}${result.collection.publicPath}` }, 200);
  })
  .post("/email-preview", requirePermission("offer", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const recordId = c.req.param("id");
    if (!recordId) {
      return c.json({ error: "候选人记录不存在。" }, 404);
    }
    const operatorId = c.var.user?.id ?? null;
    const result = await getBackgroundCheckEmailPreview(recordId, activeOrg.id, operatorId);
    await recordCreated(result.created, { operatorId, organizationId: activeOrg.id, recordId });
    return c.json(result.preview, 200);
  })
  .post(
    "/email",
    requirePermission("offer", "update"),
    zValidator("json", backgroundCheckEmailInputSchema, jsonValidatorError("邮件参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const recordId = c.req.param("id");
      if (!recordId) {
        return c.json({ error: "候选人记录不存在。" }, 404);
      }
      const operatorId = c.var.user?.id ?? null;
      const input = c.req.valid("json");
      await recordCandidateActivity({
        action: "background_check_email_send_requested",
        detail: { to: input.to },
        interviewRecordId: recordId,
        operatorId,
        organizationId: activeOrg.id,
      });
      try {
        const result = await sendBackgroundCheckEmail(recordId, activeOrg.id, input);
        await recordCandidateActivity({
          action: "background_check_email_sent",
          detail: { providerMessageId: result.providerMessageId, to: input.to },
          interviewRecordId: recordId,
          operatorId,
          organizationId: activeOrg.id,
        });
        invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(result, 200);
      } catch (error) {
        await recordCandidateActivity({
          action: "background_check_email_send_failed",
          detail: {
            error: error instanceof Error ? error.message : "邮件发送失败",
            to: input.to,
          },
          interviewRecordId: recordId,
          operatorId,
          organizationId: activeOrg.id,
        });
        throw error;
      }
    },
  );
