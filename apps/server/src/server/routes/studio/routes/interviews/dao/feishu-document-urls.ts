import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { uniq } from "lodash-es";
import { db } from "@server/lib/server/db/index";
import { interviewNotification } from "@app/db-schema/schema";

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

  const keyColumn = interviewNotification[key];
  const rows = await db
    .select({
      key: keyColumn,
      url: interviewNotification.feishuDocumentUrl,
    })
    .from(interviewNotification)
    .where(
      and(
        eq(interviewNotification.organizationId, organizationId),
        inArray(keyColumn, ids),
        eq(interviewNotification.type, "summary_ready"),
        isNotNull(interviewNotification.feishuDocumentUrl),
      ),
    )
    .orderBy(desc(interviewNotification.updatedAt));

  for (const row of rows) {
    if (row.key && row.url && !result.has(row.key)) {
      result.set(row.key, row.url);
    }
  }
  return result;
}
