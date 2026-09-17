import {
  canDeleteInitialInterview,
  deleteInitialInterview,
} from "./application/delete-initial-interview";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { presignGetObjectUrl, presignRecordingGetObjectUrl } from "@app/object-storage";
import { RecruitingPipelineError } from "@app/database/recruiting-pipeline";
import {
  createInitialInterviewSchema,
  initialInterviewRolesSchema,
  regenerateInitialInterviewSchema,
} from "@app/shared/human-initial-interview";
import { resolveRecruitingVisibilityScope } from "../../../../../../access/recruiting-visibility";
import { createRequestWorkspaceAuthorizer } from "../../../../../../access/workspace-access-policy";
import { getWorkspaceRequestContext } from "../../../../../../context/workspace-request-context";
import { factory, jsonValidatorError } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";
import { invalidateStudioInterviewCaches } from "../../../../../../cache-tags";
import { loadResumeDetail } from "../../dao/resumes";
import {
  listInitialInterviews,
  listInitialInterviewSummaries,
  loadInitialInterviewDocument,
} from "./dao";
import { importRecordedInitialInterviewSnapshot } from "./application/default-import-recorded-initial-interview";
import {
  regenerateInitialInterview,
  resumeInitialInterviewVersion,
} from "./application/change-initial-interview";
import { reviewInitialInterview } from "./application/review-initial-interview";
import { InitialInterviewError } from "./errors";

async function visibleRecord(
  c: Parameters<typeof getWorkspaceRequestContext>[0] & {
    req: { param(name: string): string | undefined };
  },
) {
  const { member, organization, user } = getWorkspaceRequestContext(c);
  const id = c.req.param("id");
  if (!id) {
    throw new InitialInterviewError("招聘记录不存在。", 404);
  }
  const visibility = await resolveRecruitingVisibilityScope({
    currentRole: member.role,
    organizationId: organization.id,
    userId: user.id,
  });
  const record = await loadResumeDetail(id, organization.id, visibility);
  if (!record) {
    throw new InitialInterviewError("招聘记录不存在或无权访问。", 404);
  }
  return {
    actorId: user.id,
    memberRole: member.role,
    organizationId: organization.id,
    recruitingRecordId: id,
  };
}

const resumeVersionSchema = z
  .object({
    overwriteDocumentId: z.string().min(1).nullable().default(null),
    roles: initialInterviewRolesSchema.optional(),
  })
  .strict();

export const initialInterviewsRouter = factory
  .createApp()
  .use("*", requirePermission("resumeLibrary", "read"))
  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Hono registers its error boundary with a callback.
  .onError((error, c) => {
    if (error instanceof InitialInterviewError) {
      return c.json({ error: error.message }, error.status);
    }
    if (error instanceof RecruitingPipelineError) {
      return c.json({ error: error.message }, error.code === "not_found" ? 404 : 409);
    }
    console.error("[initial-interview] request failed", error);
    return c.json({ error: "处理失败，请稍后重试。" }, 500);
  })
  .get("/", async (c) => {
    const scope = await visibleRecord(c);
    const authorize = createRequestWorkspaceAuthorizer({
      memberRole: scope.memberRole,
      organizationId: scope.organizationId,
      userId: scope.actorId,
    });
    const [records, document, canGenerate] = await Promise.all([
      listInitialInterviewSummaries(scope),
      loadInitialInterviewDocument(scope),
      authorize({ action: "update", resource: "resumeLibrary" }),
    ]);
    return c.json(
      {
        canDelete:
          (await authorize({ action: "delete", resource: "resumeLibrary" })) &&
          (await canDeleteInitialInterview(scope)),
        canGenerate,
        document,
        records,
      },
      200,
    );
  })
  .post(
    "/",
    requirePermission("resumeLibrary", "update"),
    zValidator("json", createInitialInterviewSchema, jsonValidatorError("生成请求无效")),
    async (c) => {
      const result = await importRecordedInitialInterviewSnapshot({
        ...(await visibleRecord(c)),
        ...c.req.valid("json"),
      });
      const { organization } = getWorkspaceRequestContext(c);
      invalidateStudioInterviewCaches(organization.id);
      return c.json(result, 202);
    },
  )
  .delete("/:snapshotId", requirePermission("resumeLibrary", "delete"), async (c) => {
    const scope = await visibleRecord(c);
    const result = await deleteInitialInterview({
      ...scope,
      initialInterviewId: c.req.param("snapshotId"),
    });
    invalidateStudioInterviewCaches(scope.organizationId);
    return c.json(result, 200);
  })
  .get("/:snapshotId", async (c) => {
    const scope = await visibleRecord(c);
    const [record] = await listInitialInterviews(scope, c.req.param("snapshotId"));
    if (!record) {
      return c.json({ error: "资料快照不存在。" }, 404);
    }
    return c.json(record, 200);
  })
  .get("/:snapshotId/playback", async (c) => {
    const [record] = await listInitialInterviews(await visibleRecord(c), c.req.param("snapshotId"));
    if (!record) {
      return c.json({ error: "资料快照不存在。" }, 404);
    }
    return c.json(
      {
        contentType: record.snapshot.recording.contentType,
        url: await presignRecordingGetObjectUrl(record.snapshot.recording.storageKey, 3600),
      },
      200,
    );
  })
  .get("/:snapshotId/resume", async (c) => {
    const [record] = await listInitialInterviews(await visibleRecord(c), c.req.param("snapshotId"));
    if (!record?.snapshot.resume) {
      return c.json({ error: "没有简历附件快照。" }, 404);
    }
    return c.redirect(await presignGetObjectUrl(record.snapshot.resume.storageKey), 302);
  })
  .post(
    "/:snapshotId/versions",
    requirePermission("resumeLibrary", "update"),
    zValidator("json", regenerateInitialInterviewSchema, jsonValidatorError("重新生成请求无效")),
    async (c) => {
      const scope = await visibleRecord(c);
      const result = await regenerateInitialInterview({
        ...scope,
        ...c.req.valid("json"),
        initialInterviewId: c.req.param("snapshotId"),
      });
      invalidateStudioInterviewCaches(scope.organizationId);
      return c.json(result, 202);
    },
  )
  .post(
    "/versions/:versionId/resume",
    requirePermission("resumeLibrary", "update"),
    zValidator("json", resumeVersionSchema, jsonValidatorError("说话人或重试请求无效")),
    async (c) => {
      const scope = await visibleRecord(c);
      const result = await resumeInitialInterviewVersion({
        ...scope,
        ...c.req.valid("json"),
        versionId: c.req.param("versionId"),
      });
      invalidateStudioInterviewCaches(scope.organizationId);
      return c.json(result, 202);
    },
  )
  .post(
    "/versions/:versionId/advance",
    requirePermission("resumeLibrary", "update"),
    zValidator(
      "json",
      z.object({ expectedVersion: z.number().int().nonnegative() }).strict(),
      jsonValidatorError("流程版本无效"),
    ),
    async (c) => {
      const scope = await visibleRecord(c);
      const result = await reviewInitialInterview({
        ...scope,
        ...c.req.valid("json"),
        versionId: c.req.param("versionId"),
      });
      invalidateStudioInterviewCaches(scope.organizationId);
      return c.json(result, 200);
    },
  );
