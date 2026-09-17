import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { getObjectStream, deleteRecruitingMaterialObject } from "@app/object-storage";
import { RECRUITING_MATERIAL_MAX_BYTES } from "@app/shared/recruiting-materials";
import { factory } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";
import { getWorkspaceRequestContext } from "../../../../../../context/workspace-request-context";
import { resolveRecruitingVisibilityScope } from "../../../../../../access/recruiting-visibility";
import { loadResumeDetail } from "../../../resumes/dao/resumes";
import { findMaterial, listMaterials, removeMaterial } from "./dao";
import { uploadMaterial } from "./application/upload-material";
import { RecruitingMaterialError } from "./errors";

const defaultDependencies = {
  deleteRecruitingMaterialObject,
  findMaterial,
  getObjectStream,
  listMaterials,
  loadResumeDetail,
  removeMaterial,
  requirePermission,
  resolveRecruitingVisibilityScope,
  uploadMaterial,
};
export type MaterialsRouteDependencies = typeof defaultDependencies;

async function visibleRecord(
  c: Parameters<typeof getWorkspaceRequestContext>[0] & {
    req: { param(name: string): string | undefined };
  },
  dependencies: MaterialsRouteDependencies,
) {
  const { member, organization, user } = getWorkspaceRequestContext(c);
  const id = c.req.param("id");
  const visibility = await dependencies.resolveRecruitingVisibilityScope({
    currentRole: member.role,
    organizationId: organization.id,
    userId: user.id,
  });
  if (!id || !(await dependencies.loadResumeDetail(id, organization.id, visibility))) {
    throw new RecruitingMaterialError("招聘记录不存在或无权访问", 404);
  }
  return { actorId: user.id, organizationId: organization.id, recruitingRecordId: id };
}

export function createMaterialsRouter(
  dependencies: MaterialsRouteDependencies = defaultDependencies,
) {
  return (
    factory
      .createApp()
      .use("*", dependencies.requirePermission("offer", "read"))
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Hono error boundary.
      .onError((error, c) => {
        if (error instanceof RecruitingMaterialError) {
          return c.json({ error: error.message }, error.status);
        }
        if (error instanceof HTTPException) {
          return error.getResponse();
        }
        console.error("[recruiting-material] request failed", error);
        return c.json({ error: "附件操作失败，请稍后重试" }, 500);
      })
      .get("/", async (c) => {
        const rows = await dependencies.listMaterials(await visibleRecord(c, dependencies));
        return c.json(
          rows.map(({ id, fileName, contentType, sizeBytes, createdAt }) => ({
            contentType,
            createdAt: createdAt.toISOString(),
            fileName,
            id,
            sizeBytes,
          })),
          200,
        );
      })
      .post(
        "/",
        dependencies.requirePermission("offer", "create"),
        bodyLimit({
          maxSize: RECRUITING_MATERIAL_MAX_BYTES + 64 * 1024,
          onError: (c) => c.json({ error: "单个文件不能超过 20 MB" }, 413),
        }),
        async (c) => {
          const scope = await visibleRecord(c, dependencies);
          const body = await c.req.parseBody({ all: true });
          const { file } = body;
          if (!(file instanceof File)) {
            return c.json({ error: "请每次上传一个文件" }, 400);
          }
          return c.json(await dependencies.uploadMaterial(scope, file), 201);
        },
      )
      .get("/:materialId/file", async (c) => {
        const row = await dependencies.findMaterial(
          await visibleRecord(c, dependencies),
          c.req.param("materialId"),
        );
        const object = await dependencies.getObjectStream(row.storageKey);
        if (!object) {
          return c.json({ error: "附件文件不存在" }, 404);
        }
        // Always download arbitrary user files; never execute uploaded HTML/SVG on the app origin.
        return new Response(object.body, {
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
            "Content-Type": "application/octet-stream",
            "X-Content-Type-Options": "nosniff",
          },
        });
      })
      .delete("/:materialId", dependencies.requirePermission("offer", "delete"), async (c) => {
        const row = await dependencies.removeMaterial(
          await visibleRecord(c, dependencies),
          c.req.param("materialId"),
        );
        try {
          await dependencies.deleteRecruitingMaterialObject(row.storageKey);
        } catch (error) {
          console.error("[recruiting-material] deleted file cleanup failed", {
            error,
            storageKey: row.storageKey,
          });
        }
        return c.json({ success: true }, 200);
      })
  );
}

export const materialsRouter = createMaterialsRouter();
