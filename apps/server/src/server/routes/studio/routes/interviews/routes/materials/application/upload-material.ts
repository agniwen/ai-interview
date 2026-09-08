import { randomUUID } from "node:crypto";
import { validateRecruitingMaterialFiles } from "@app/shared/recruiting-materials";
import {
  buildRecruitingMaterialKey,
  putObjectBytes,
  deleteRecruitingMaterialObject,
} from "@app/object-storage";
import { withMaterialLock } from "../dao";
import type { MaterialScope } from "../dao";
import { RecruitingMaterialError } from "../errors";

const defaultDependencies = {
  buildRecruitingMaterialKey,
  deleteRecruitingMaterialObject,
  putObjectBytes,
  withMaterialLock,
};

export async function uploadMaterial(
  scope: MaterialScope,
  file: File,
  dependencies = defaultDependencies,
) {
  const validationError = validateRecruitingMaterialFiles([file], 0);
  if (validationError) {
    throw new RecruitingMaterialError(validationError);
  }
  const id = randomUUID();
  const storageKey = await dependencies.buildRecruitingMaterialKey(
    scope.organizationId,
    scope.recruitingRecordId,
    id,
  );
  let uploaded = false;
  try {
    await dependencies.withMaterialLock(scope, async (store) => {
      const countError = validateRecruitingMaterialFiles([file], await store.count());
      if (countError) {
        throw new RecruitingMaterialError(countError, 409);
      }
      await dependencies.putObjectBytes({
        body: new Uint8Array(await file.arrayBuffer()),
        contentType: file.type || "application/octet-stream",
        storageKey,
      });
      uploaded = true;
      await store.insert({
        contentType: file.type || "application/octet-stream",
        fileName: file.name,
        id,
        kind: "income_proof",
        organizationId: scope.organizationId,
        recruitingRecordId: scope.recruitingRecordId,
        sizeBytes: file.size,
        storageKey,
        uploadedBy: scope.actorId,
      });
    });
  } catch (error) {
    if (uploaded) {
      try {
        await dependencies.deleteRecruitingMaterialObject(storageKey);
      } catch (cleanupError) {
        console.error("[recruiting-material] upload cleanup failed", { cleanupError, storageKey });
      }
    }
    throw error;
  }
  return { id };
}
