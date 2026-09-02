import { db } from "../../../../../../lib/server/db/index";
import type { JsonObject } from "@app/db-schema/json";
import { interviewAuditLog } from "@app/db-schema/schema";

export async function recordCandidateActivity({
  action,
  detail = {},
  interviewRecordId,
  operatorId,
  organizationId,
  scheduleEntryId = null,
}: {
  action: string;
  detail?: JsonObject;
  interviewRecordId: string;
  operatorId: string | null;
  organizationId: string;
  scheduleEntryId?: string | null;
}) {
  await db.insert(interviewAuditLog).values({
    action,
    createdAt: new Date(),
    detail,
    id: crypto.randomUUID(),
    interviewRecordId,
    operatorId,
    organizationId,
    scheduleEntryId,
  });
}
