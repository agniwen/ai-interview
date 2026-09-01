import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { globalConfig } from "@arc/db-schema/schema";
import { DEFAULT_JOB_CODE_PREFIX } from "@arc/shared/global-config";
import type { GlobalConfigInput } from "@arc/shared/global-config";
import { WORKSPACE_DATABASE_PORT } from "../workspace.ports.js";
import type { WorkspaceDatabasePort } from "../workspace.ports.js";

function serialize(row: typeof globalConfig.$inferSelect) {
  return {
    closingInstructions: row.closingInstructions,
    companyContext: row.companyContext,
    companyName: row.companyName,
    jobCodePrefix: row.jobCodePrefix,
    openingInstructions: row.openingInstructions,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

@Injectable()
export class GlobalConfigService {
  constructor(@Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort) {}

  async get(organizationId: string) {
    const existing = await this.database
      .select()
      .from(globalConfig)
      .where(eq(globalConfig.organizationId, organizationId))
      .limit(1);
    if (existing[0]) {
      return serialize(existing[0]);
    }

    const row = {
      closingInstructions: "",
      companyContext: "",
      companyName: "",
      id: `gc_${crypto.randomUUID()}`,
      jobCodePrefix: DEFAULT_JOB_CODE_PREFIX,
      openingInstructions: "",
      organizationId,
      updatedAt: new Date(),
      updatedBy: null,
    } satisfies typeof globalConfig.$inferInsert;
    await this.database.insert(globalConfig).values(row).onConflictDoNothing();
    const resolved = await this.database
      .select()
      .from(globalConfig)
      .where(eq(globalConfig.organizationId, organizationId))
      .limit(1);
    return serialize(resolved[0] ?? row);
  }

  async update(organizationId: string, actorId: string, input: GlobalConfigInput) {
    const now = new Date();
    const rows = await this.database
      .insert(globalConfig)
      .values({
        ...input,
        id: `gc_${crypto.randomUUID()}`,
        organizationId,
        updatedAt: now,
        updatedBy: actorId,
      })
      .onConflictDoUpdate({
        set: { ...input, updatedAt: now, updatedBy: actorId },
        target: globalConfig.organizationId,
      })
      .returning();
    return serialize(rows[0]);
  }
}
