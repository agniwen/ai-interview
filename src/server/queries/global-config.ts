import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { globalConfig } from "@/lib/db/schema";
import type { GlobalConfigInput, GlobalConfigRecord } from "@/lib/global-config";

const SINGLETON_ID = "singleton";

function serialize(row: typeof globalConfig.$inferSelect): GlobalConfigRecord {
  return {
    closingInstructions: row.closingInstructions,
    companyContext: row.companyContext,
    openingInstructions: row.openingInstructions,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

// 读取全局配置；不存在时返回默认空配置（不写库）
// Read singleton config; if missing, return empty defaults without writing.
export async function getGlobalConfig(): Promise<GlobalConfigRecord> {
  const [row] = await db
    .select()
    .from(globalConfig)
    .where(eq(globalConfig.id, SINGLETON_ID))
    .limit(1);
  if (!row) {
    return {
      closingInstructions: "",
      companyContext: "",
      openingInstructions: "",
      updatedAt: new Date(0).toISOString(),
      updatedBy: null,
    };
  }
  return serialize(row);
}

// 单例 upsert（按固定 id 冲突更新）
// Singleton upsert (conflict on fixed id).
export async function upsertGlobalConfig(
  input: GlobalConfigInput,
  userId: string | null,
): Promise<GlobalConfigRecord> {
  const now = new Date();
  const values = {
    closingInstructions: input.closingInstructions,
    companyContext: input.companyContext,
    id: SINGLETON_ID,
    openingInstructions: input.openingInstructions,
    updatedAt: now,
    updatedBy: userId,
  };
  const [row] = await db
    .insert(globalConfig)
    .values(values)
    .onConflictDoUpdate({
      set: {
        closingInstructions: values.closingInstructions,
        companyContext: values.companyContext,
        openingInstructions: values.openingInstructions,
        updatedAt: values.updatedAt,
        updatedBy: values.updatedBy,
      },
      target: globalConfig.id,
    })
    .returning();
  return serialize(row);
}
