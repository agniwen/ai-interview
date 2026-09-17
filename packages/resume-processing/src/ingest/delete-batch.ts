import { and, eq, inArray } from "drizzle-orm";
import { recruitingMailMessage, recruitingUploadBatch } from "@app/db-schema/schema";
import { db } from "../database";

/** 删除终态批次前解除新邮件审计的可选引用；保留邮件和已创建的招聘记录。 */
export function deleteBatch(
  batchId: string,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const condition = and(
      eq(recruitingUploadBatch.id, batchId),
      eq(recruitingUploadBatch.organizationId, organizationId),
      eq(recruitingUploadBatch.createdBy, userId),
      inArray(recruitingUploadBatch.status, ["completed", "cancelled"]),
    );
    const [batch] = await tx
      .select({ id: recruitingUploadBatch.id })
      .from(recruitingUploadBatch)
      .where(condition)
      .for("update");
    if (!batch) {
      return false;
    }
    await tx
      .update(recruitingMailMessage)
      .set({ batchId: null })
      .where(
        and(
          eq(recruitingMailMessage.batchId, batchId),
          eq(recruitingMailMessage.organizationId, organizationId),
        ),
      );
    const removed = await tx
      .delete(recruitingUploadBatch)
      .where(condition)
      .returning({ id: recruitingUploadBatch.id });
    return removed.length > 0;
  });
}
