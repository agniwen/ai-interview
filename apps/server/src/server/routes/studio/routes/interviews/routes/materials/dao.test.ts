import { createRecruitingRecords } from "@app/database/recruiting-records";
import { organization, recruitingMaterial, recruitingRecord } from "@app/db-schema/schema";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "../../../../../../../lib/server/db";
import { updateMaterialMetadata } from "./dao";

it("persists per-file metadata and guards record, workspace and stage inside the transaction", async () => {
  const rollback = new Error("rollback material fixture");
  await expect(
    db.transaction(async (tx) => {
      const id = crypto.randomUUID();
      await tx
        .insert(organization)
        .values({ createdAt: new Date(), id, name: "附件元数据回归测试", slug: id });
      await createRecruitingRecords(tx, {
        candidateName: "测试候选人",
        id,
        organizationId: id,
        pipelineStage: "income_proof",
      });
      await tx.insert(recruitingMaterial).values({
        contentType: "application/pdf",
        fileName: "test.pdf",
        id,
        kind: "income_proof",
        organizationId: id,
        recruitingRecordId: id,
        sizeBytes: 1,
        storageKey: "test-only-never-uploaded",
      });
      const scope = { actorId: id, organizationId: id, recruitingRecordId: id };
      const executor = { transaction: tx.transaction.bind(tx) };
      const metadata = { incomeType: "stock", notes: "第一行\n第二行\n第三行" } as const;
      await updateMaterialMetadata(scope, id, metadata, executor);
      const [saved] = await tx
        .select()
        .from(recruitingMaterial)
        .where(eq(recruitingMaterial.id, id));
      expect(saved).toMatchObject(metadata);
      await expect(
        updateMaterialMetadata({ ...scope, organizationId: "wrong-org" }, id, metadata, executor),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        updateMaterialMetadata(scope, "other-file", metadata, executor),
      ).rejects.toMatchObject({ status: 404 });
      await tx
        .update(recruitingRecord)
        .set({ currentStage: "salary_negotiation" })
        .where(eq(recruitingRecord.id, id));
      await expect(updateMaterialMetadata(scope, id, metadata, executor)).rejects.toMatchObject({
        status: 409,
      });
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});
