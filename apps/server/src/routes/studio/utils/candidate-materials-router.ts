import { createHash } from "node:crypto";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  buildCandidateMaterialKeyByHash,
  deleteCandidateMaterialObject,
  getObjectStream,
  putObjectBytes,
} from "@app/object-storage";
import {
  CandidateMaterialError,
  countCandidateMaterialsTx,
  createCandidateMaterialLink,
  deleteCandidateMaterial,
  findCandidateMaterial,
  hasAnyCandidateMaterialStorageKey,
  insertCandidateMaterialFileTx,
  listCandidateMaterials,
  updateCandidateMaterial,
} from "@app/recruiting/candidate-materials";
import type { CandidateMaterialOwnerScope } from "@app/recruiting/candidate-materials";
import {
  CANDIDATE_MATERIAL_MAX_BYTES,
  CANDIDATE_MATERIAL_MAX_COUNT,
  createCandidateMaterialLinkSchema,
  updateCandidateMaterialSchema,
  uploadCandidateMaterialMetadataSchema,
  validateCandidateMaterialFiles,
} from "@app/shared/candidate-materials";
import type { CandidateMaterialOwnerType } from "@app/shared/candidate-materials";
import type { WorkspaceAction, WorkspaceResource } from "../../../access/workspace-access-policy";
import { getWorkspaceRequestContext } from "../../../context/workspace-request-context";
import { factory, jsonValidatorError } from "../../../factory";
import { db } from "../../../infrastructure/db/index";
import { requirePermission } from "../../../middlewares/permission";

const multipartTextSchema = z.string();

type MultipartBodyValue = string | File | (string | File)[] | undefined;

function parseOptionalTextField(value: MultipartBodyValue): string | undefined {
  const parsed = multipartTextSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  const trimmed = parsed.data.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseNotesField(value: MultipartBodyValue): string {
  const parsed = multipartTextSchema.safeParse(value);
  return parsed.success ? parsed.data : "";
}

export interface CreateCandidateMaterialsRouterOptions<
  RRead extends WorkspaceResource = WorkspaceResource,
  RWrite extends WorkspaceResource = WorkspaceResource,
> {
  ownerType: CandidateMaterialOwnerType;
  readPermission: readonly [RRead, WorkspaceAction<RRead>];
  resolveOwnerAccess: (input: {
    memberRole: string;
    organizationId: string;
    ownerId: string;
    userId: string;
  }) => Promise<boolean>;
  writePermission: readonly [RWrite, WorkspaceAction<RWrite>];
}

function buildOwnerScope(
  ownerType: CandidateMaterialOwnerType,
  organizationId: string,
  ownerId: string,
): CandidateMaterialOwnerScope {
  if (ownerType === "resume_pool_item") {
    return { organizationId, ownerId, ownerType: "resume_pool_item" };
  }
  return { organizationId, ownerId, ownerType: "recruiting_record" };
}

export function createCandidateMaterialsRouter<
  RRead extends WorkspaceResource,
  RWrite extends WorkspaceResource,
>(options: CreateCandidateMaterialsRouterOptions<RRead, RWrite>) {
  async function resolveOwnerScope(
    c: Parameters<typeof getWorkspaceRequestContext>[0] & {
      req: { param(name: string): string | undefined };
    },
  ) {
    const { member, organization, user } = getWorkspaceRequestContext(c);
    const ownerId = c.req.param("id");
    if (!ownerId) {
      throw new CandidateMaterialError("记录不存在或无权访问", 404);
    }
    const allowed = await options.resolveOwnerAccess({
      memberRole: member.role,
      organizationId: organization.id,
      ownerId,
      userId: user.id,
    });
    if (!allowed) {
      throw new CandidateMaterialError("记录不存在或无权访问", 404);
    }
    return {
      actorId: user.id,
      scope: buildOwnerScope(options.ownerType, organization.id, ownerId),
    };
  }

  const readGuard = requirePermission(options.readPermission[0], options.readPermission[1]);
  const writeGuard = requirePermission(options.writePermission[0], options.writePermission[1]);

  return (
    factory
      .createApp()
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Hono error boundary.
      .onError((error, c) => {
        if (error instanceof CandidateMaterialError) {
          return c.json({ error: error.message }, error.status);
        }
        if (error instanceof HTTPException) {
          return error.getResponse();
        }
        console.error("[candidate-material] request failed", error);
        return c.json({ error: "资料操作失败，请稍后重试" }, 500);
      })
      .get("/", readGuard, async (c) => {
        const { scope } = await resolveOwnerScope(c);
        const items = await listCandidateMaterials(scope);
        return c.json(items, 200);
      })
      .post(
        "/links",
        writeGuard,
        zValidator(
          "json",
          createCandidateMaterialLinkSchema,
          jsonValidatorError("资料链接参数无效。"),
        ),
        async (c) => {
          const { actorId, scope } = await resolveOwnerScope(c);
          const item = await createCandidateMaterialLink(scope, c.req.valid("json"), actorId, db);
          return c.json(item, 201);
        },
      )
      .post(
        "/files",
        writeGuard,
        bodyLimit({
          maxSize: CANDIDATE_MATERIAL_MAX_BYTES + 64 * 1024,
          onError: (c) => c.json({ error: "单个文件不能超过 100 MB。" }, 413),
        }),
        async (c) => {
          const { actorId, scope } = await resolveOwnerScope(c);
          const body = await c.req.parseBody({ all: true });
          const { file } = body;
          if (!(file instanceof File)) {
            return c.json({ error: "请每次上传一个文件" }, 400);
          }
          const validationError = validateCandidateMaterialFiles([file], 0);
          if (validationError) {
            return c.json({ error: validationError }, 400);
          }
          const metadata = uploadCandidateMaterialMetadataSchema.safeParse({
            notes: parseNotesField(body.notes),
            title: parseOptionalTextField(body.title),
          });
          if (!metadata.success) {
            return c.json({ error: metadata.error.issues[0]?.message ?? "资料参数无效。" }, 400);
          }

          const existingCount = await db.transaction((tx) => countCandidateMaterialsTx(tx, scope));
          if (existingCount >= CANDIDATE_MATERIAL_MAX_COUNT) {
            return c.json(
              {
                error: `每条记录最多保存 ${CANDIDATE_MATERIAL_MAX_COUNT} 份补充资料，请删除后再添加`,
              },
              409,
            );
          }

          const bytes = new Uint8Array(await file.arrayBuffer());
          const contentHash = createHash("sha256").update(bytes).digest("hex");
          const contentType = file.type || "application/octet-stream";
          const storageKey = await buildCandidateMaterialKeyByHash(
            scope.organizationId,
            contentHash,
          );

          let uploaded = false;
          try {
            await putObjectBytes({ body: bytes, contentType, storageKey });
            uploaded = true;
            const item = await db.transaction((tx) =>
              insertCandidateMaterialFileTx(
                tx,
                scope,
                {
                  contentHash,
                  contentType,
                  fileName: file.name,
                  notes: metadata.data.notes,
                  sizeBytes: file.size,
                  storageKey,
                  title: metadata.data.title,
                },
                actorId,
              ),
            );
            return c.json(item, 201);
          } catch (error) {
            if (uploaded) {
              try {
                const referenced = await hasAnyCandidateMaterialStorageKey(storageKey, db);
                if (!referenced) {
                  await deleteCandidateMaterialObject(storageKey);
                }
              } catch (cleanupError) {
                console.error("[candidate-material] upload cleanup failed", {
                  cleanupError,
                  storageKey,
                });
              }
            }
            throw error;
          }
        },
      )
      .patch(
        "/:materialId",
        writeGuard,
        zValidator("json", updateCandidateMaterialSchema, jsonValidatorError("资料更新参数无效。")),
        async (c) => {
          const { scope } = await resolveOwnerScope(c);
          const updated = await updateCandidateMaterial(
            scope,
            c.req.param("materialId"),
            c.req.valid("json"),
            db,
          );
          if (!updated) {
            return c.json({ error: "资料不存在或无权访问" }, 404);
          }
          return c.json(updated, 200);
        },
      )
      .delete("/:materialId", writeGuard, async (c) => {
        const { scope } = await resolveOwnerScope(c);
        const result = await deleteCandidateMaterial(scope, c.req.param("materialId"), db);
        if (!result) {
          return c.json({ error: "资料不存在或无权访问" }, 404);
        }
        if (result.shouldDeleteObject && result.removed.storageKey) {
          try {
            await deleteCandidateMaterialObject(result.removed.storageKey);
          } catch (error) {
            console.error("[candidate-material] deleted file cleanup failed", {
              error,
              storageKey: result.removed.storageKey,
            });
          }
        }
        return c.json({ success: true }, 200);
      })
      .get("/:materialId/file", readGuard, async (c) => {
        const { scope } = await resolveOwnerScope(c);
        const row = await findCandidateMaterial(scope, c.req.param("materialId"), db);
        if (!row || row.kind !== "file" || !row.storageKey || !row.fileName) {
          return c.json({ error: "资料文件不存在或无权访问" }, 404);
        }
        const object = await getObjectStream(row.storageKey);
        if (!object) {
          return c.json({ error: "资料文件不存在" }, 404);
        }
        return new Response(object.body, {
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
            "Content-Type": "application/octet-stream",
            "X-Content-Type-Options": "nosniff",
          },
        });
      })
  );
}
