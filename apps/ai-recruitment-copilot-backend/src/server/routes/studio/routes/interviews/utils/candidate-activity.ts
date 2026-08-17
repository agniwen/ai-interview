import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import type { JsonObject } from "@arc/db-schema/json";
import { interviewAuditLog } from "@arc/db-schema/schema";

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
