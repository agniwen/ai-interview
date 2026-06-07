import { eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { globalConfig } from "@arc/db-schema/schema";
import type { GlobalConfigInput, GlobalConfigRecord } from "@arc/shared/global-config";

function serialize(row: typeof globalConfig.$inferSelect): GlobalConfigRecord {
  return {
    closingInstructions: row.closingInstructions,
    companyContext: row.companyContext,
    companyName: row.companyName,
    openingInstructions: row.openingInstructions,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

// 按 organizationId 读取配置；不存在时懒创建一条空记录。
// Read config scoped to organizationId; lazily inserts an empty row when absent.
export async function getGlobalConfig(orgId: string): Promise<GlobalConfigRecord> {
  const [row] = await db
    .select()
    .from(globalConfig)
    .where(eq(globalConfig.organizationId, orgId))
    .limit(1);

  if (row) {
    return serialize(row);
  }

  // Lazy-create a blank config row for workspaces that have none yet (new
  // self-serve orgs or orgs created before this column was backfilled).
  const fresh = {
    closingInstructions: "",
    companyContext: "",
    companyName: "",
    id: `gc_${crypto.randomUUID()}`,
    openingInstructions: "",
    organizationId: orgId,
    updatedAt: new Date(),
    updatedBy: null as string | null,
  };
  await db.insert(globalConfig).values(fresh);
  return serialize({ ...fresh });
}

// 按 organizationId 更新配置；不存在时懒创建再更新。
// Update config scoped to organizationId; lazily inserts if the row is absent.
export async function upsertGlobalConfig(
  input: GlobalConfigInput,
  userId: string | null,
  orgId: string,
): Promise<GlobalConfigRecord> {
  const now = new Date();

  const [existing] = await db
    .select({ id: globalConfig.id })
    .from(globalConfig)
    .where(eq(globalConfig.organizationId, orgId))
    .limit(1);

  if (!existing) {
    const fresh = {
      closingInstructions: input.closingInstructions,
      companyContext: input.companyContext,
      companyName: input.companyName,
      id: `gc_${crypto.randomUUID()}`,
      openingInstructions: input.openingInstructions,
      organizationId: orgId,
      updatedAt: now,
      updatedBy: userId,
    };
    await db.insert(globalConfig).values(fresh);
    return serialize({ ...fresh });
  }

  await db
    .update(globalConfig)
    .set({
      closingInstructions: input.closingInstructions,
      companyContext: input.companyContext,
      companyName: input.companyName,
      openingInstructions: input.openingInstructions,
      updatedAt: now,
      updatedBy: userId,
    })
    .where(eq(globalConfig.organizationId, orgId));

  const [updated] = await db
    .select()
    .from(globalConfig)
    .where(eq(globalConfig.organizationId, orgId))
    .limit(1);
  return serialize(updated);
}
