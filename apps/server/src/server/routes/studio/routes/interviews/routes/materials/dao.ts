import { and, eq, asc } from "drizzle-orm";
import { recruitingMaterial } from "@app/db-schema/schema";
import { lockRecruitingRecord } from "@app/database/recruiting-records";
import { db } from "../../../../../../../lib/server/db";
import { RecruitingMaterialError } from "./errors";

export interface MaterialScope {
  organizationId: string;
  recruitingRecordId: string;
  actorId: string;
}

function materialWhere(scope: MaterialScope) {
  return and(
    eq(recruitingMaterial.organizationId, scope.organizationId),
    eq(recruitingMaterial.recruitingRecordId, scope.recruitingRecordId),
    eq(recruitingMaterial.kind, "income_proof"),
  );
}

export function listMaterials(scope: MaterialScope) {
  return db
    .select()
    .from(recruitingMaterial)
    .where(materialWhere(scope))
    .orderBy(asc(recruitingMaterial.createdAt));
}

export async function findMaterial(scope: MaterialScope, id: string) {
  const [row] = await db
    .select()
    .from(recruitingMaterial)
    .where(and(materialWhere(scope), eq(recruitingMaterial.id, id)));
  if (!row) {
    throw new RecruitingMaterialError("附件不存在或无权访问", 404);
  }
  return row;
}

export function withMaterialLock<T>(
  scope: MaterialScope,
  action: (store: {
    count: () => Promise<number>;
    insert: (row: typeof recruitingMaterial.$inferInsert) => Promise<void>;
  }) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    const record = await lockRecruitingRecord(tx, scope.recruitingRecordId, scope.organizationId);
    if (!record) {
      throw new RecruitingMaterialError("候选人不存在", 404);
    }
    if (record.currentStage !== "income_proof") {
      throw new RecruitingMaterialError("仅流水提供阶段可上传或删除附件", 409);
    }
    return action({
      count: async () => {
        const rows = await tx
          .select({ id: recruitingMaterial.id })
          .from(recruitingMaterial)
          .where(materialWhere(scope));
        return rows.length;
      },
      insert: async (row) => {
        await tx.insert(recruitingMaterial).values(row);
      },
    });
  });
}

export function removeMaterial(scope: MaterialScope, id: string) {
  return db.transaction(async (tx) => {
    const record = await lockRecruitingRecord(tx, scope.recruitingRecordId, scope.organizationId);
    if (!record) {
      throw new RecruitingMaterialError("候选人不存在", 404);
    }
    if (record.currentStage !== "income_proof") {
      throw new RecruitingMaterialError("仅流水提供阶段可上传或删除附件", 409);
    }
    const [removed] = await tx
      .delete(recruitingMaterial)
      .where(and(materialWhere(scope), eq(recruitingMaterial.id, id)))
      .returning();
    if (!removed) {
      throw new RecruitingMaterialError("附件不存在或无权访问", 404);
    }
    return removed;
  });
}
