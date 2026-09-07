import { and, eq, inArray } from "drizzle-orm";
import { uniq } from "lodash-es";
import { db } from "../../../../../../lib/server/db/index";
import { aiInterviewConversation, recruitingEvaluationDocument } from "@app/db-schema/schema";

export async function loadLatestFeishuDocumentUrls({
  ids: inputIds,
  key,
  organizationId,
}: {
  ids: string[];
  key: "conversationId" | "interviewRecordId";
  organizationId: string;
}) {
  const ids = uniq(inputIds.filter(Boolean));
  const result = new Map<string, string>();
  if (ids.length === 0) {
    return result;
  }

  const table = recruitingEvaluationDocument;
  const scope = and(eq(table.organizationId, organizationId), eq(table.status, "ready"));
  const rows =
    key === "interviewRecordId"
      ? await db
          .select({ key: table.recruitingRecordId, url: table.documentUrl })
          .from(table)
          .where(and(scope, inArray(table.recruitingRecordId, ids)))
      : await db
          .select({ key: aiInterviewConversation.conversationId, url: table.documentUrl })
          .from(table)
          .innerJoin(
            aiInterviewConversation,
            and(
              eq(aiInterviewConversation.recruitingRecordId, table.recruitingRecordId),
              eq(aiInterviewConversation.organizationId, table.organizationId),
            ),
          )
          .where(and(scope, inArray(aiInterviewConversation.conversationId, ids)));

  for (const row of rows) {
    if (row.key && row.url && !result.has(row.key)) {
      result.set(row.key, row.url);
    }
  }
  return result;
}
