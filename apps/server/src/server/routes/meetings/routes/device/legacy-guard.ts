import type { Context } from "hono";
import type { Env } from "../../../../type";
import { db } from "../../../../../lib/server/db";

/** Legacy HTTP mutation paths cannot enqueue device-owned Echo work. */
export async function echoDeviceRequired(c: Context<Env>) {
  const organizationId = c.var.activeOrg?.id;
  const meetingId = c.req.param("id");
  if (!organizationId || !meetingId) {
    return null;
  }
  const meeting = await db.query.meetingSession.findFirst({
    columns: { processingOwner: true },
    where: { id: meetingId, organizationId },
  });
  return meeting?.processingOwner === "device"
    ? c.json({ code: "echo-device-required", error: "请在 Echo 中处理此录音" }, 409)
    : null;
}
