import { getObjectBytes, getObjectStream } from "@app/object-storage";
import { factory } from "../../../../factory";
import { createPptxPreviewPdfResponse } from "../../../studio/utils/pptx-preview";
import {
  authorizeHumanInterviewCandidateMaterials,
  listHumanInterviewMeetingCandidates,
  loadHumanInterviewCandidateAiEvaluation,
  loadHumanInterviewCandidateHrInformation,
  loadHumanInterviewCandidateOverview,
  loadHumanInterviewCandidateQuestions,
  loadHumanInterviewCandidateResume,
  recordHumanInterviewCandidateMaterialView,
} from "./dao";

export interface HumanInterviewCandidateMaterialsRouterDependencies {
  authorize: typeof authorizeHumanInterviewCandidateMaterials;
  createPptxPreviewPdfResponse: typeof createPptxPreviewPdfResponse;
  getObjectBytes: typeof getObjectBytes;
  getObjectStream: typeof getObjectStream;
  listCandidates: typeof listHumanInterviewMeetingCandidates;
  loadAiEvaluation: typeof loadHumanInterviewCandidateAiEvaluation;
  loadHrInformation: typeof loadHumanInterviewCandidateHrInformation;
  loadOverview: typeof loadHumanInterviewCandidateOverview;
  loadQuestions: typeof loadHumanInterviewCandidateQuestions;
  loadResume: typeof loadHumanInterviewCandidateResume;
  recordView: typeof recordHumanInterviewCandidateMaterialView;
}

const defaultDependencies: HumanInterviewCandidateMaterialsRouterDependencies = {
  authorize: authorizeHumanInterviewCandidateMaterials,
  createPptxPreviewPdfResponse,
  getObjectBytes,
  getObjectStream,
  listCandidates: listHumanInterviewMeetingCandidates,
  loadAiEvaluation: loadHumanInterviewCandidateAiEvaluation,
  loadHrInformation: loadHumanInterviewCandidateHrInformation,
  loadOverview: loadHumanInterviewCandidateOverview,
  loadQuestions: loadHumanInterviewCandidateQuestions,
  loadResume: loadHumanInterviewCandidateResume,
  recordView: recordHumanInterviewCandidateMaterialView,
};

export function createHumanInterviewCandidateMaterialsRouter(
  overrides: Partial<HumanInterviewCandidateMaterialsRouterDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };

  function authorizeRequest(inviteToken: string) {
    return dependencies.authorize({ inviteToken });
  }

  return factory
    .createApp()
    .get("/:inviteToken", async (c) => {
      const authorization = await authorizeRequest(c.req.param("inviteToken"));
      if (authorization.status === "not_found") {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      if (authorization.status === "unavailable") {
        return c.json({ error: "候选人资料查看时间已结束。" }, 410);
      }

      const candidates = await dependencies.listCandidates(authorization.scope);
      return c.json({ candidates, meetingId: authorization.scope.meetingId }, 200);
    })
    .get("/:inviteToken/:candidateId", async (c) => {
      const authorization = await authorizeRequest(c.req.param("inviteToken"));
      if (authorization.status === "not_found") {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      if (authorization.status === "unavailable") {
        return c.json({ error: "候选人资料查看时间已结束。" }, 410);
      }

      const candidateId = c.req.param("candidateId");
      const detail = await dependencies.loadOverview({ candidateId, scope: authorization.scope });
      if (!detail) {
        return c.json({ error: "该候选人不属于当前会议。" }, 404);
      }
      await dependencies.recordView({ candidateId, scope: authorization.scope });
      return c.json(detail, 200);
    })
    .get("/:inviteToken/:candidateId/ai-evaluation", async (c) => {
      const authorization = await authorizeRequest(c.req.param("inviteToken"));
      if (authorization.status === "not_found") {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      if (authorization.status === "unavailable") {
        return c.json({ error: "候选人资料查看时间已结束。" }, 410);
      }
      const result = await dependencies.loadAiEvaluation({
        candidateId: c.req.param("candidateId"),
        scope: authorization.scope,
      });
      return result ? c.json(result, 200) : c.json({ error: "该候选人不属于当前会议。" }, 404);
    })
    .get("/:inviteToken/:candidateId/hr-initial-information", async (c) => {
      const authorization = await authorizeRequest(c.req.param("inviteToken"));
      if (authorization.status === "not_found") {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      if (authorization.status === "unavailable") {
        return c.json({ error: "候选人资料查看时间已结束。" }, 410);
      }
      const result = await dependencies.loadHrInformation({
        candidateId: c.req.param("candidateId"),
        scope: authorization.scope,
      });
      return result ? c.json(result, 200) : c.json({ error: "该候选人不属于当前会议。" }, 404);
    })
    .get("/:inviteToken/:candidateId/interview-questions", async (c) => {
      const authorization = await authorizeRequest(c.req.param("inviteToken"));
      if (authorization.status === "not_found") {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      if (authorization.status === "unavailable") {
        return c.json({ error: "候选人资料查看时间已结束。" }, 410);
      }
      const result = await dependencies.loadQuestions({
        candidateId: c.req.param("candidateId"),
        scope: authorization.scope,
      });
      return result ? c.json(result, 200) : c.json({ error: "该候选人不属于当前会议。" }, 404);
    })
    .get("/:inviteToken/:candidateId/resume", async (c) => {
      const authorization = await authorizeRequest(c.req.param("inviteToken"));
      if (authorization.status === "not_found") {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      if (authorization.status === "unavailable") {
        return c.json({ error: "候选人资料查看时间已结束。" }, 410);
      }
      const resume = await dependencies.loadResume({
        candidateId: c.req.param("candidateId"),
        scope: authorization.scope,
      });
      if (!resume) {
        return c.json({ error: "该候选人没有可预览的简历文件。" }, 404);
      }
      const object = await dependencies.getObjectStream(resume.storageKey);
      if (!object) {
        return c.json({ error: "简历文件已不可用。" }, 404);
      }
      const filename = resume.fileName || "resume.pdf";
      return new Response(object.body, {
        headers: {
          "Cache-Control": "private, max-age=300",
          "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
          "Content-Type": object.contentType ?? "application/octet-stream",
          ...(object.contentLength !== undefined && {
            "Content-Length": String(object.contentLength),
          }),
        },
      });
    })
    .get("/:inviteToken/:candidateId/resume-preview.pdf", async (c) => {
      const authorization = await authorizeRequest(c.req.param("inviteToken"));
      if (authorization.status === "not_found") {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      if (authorization.status === "unavailable") {
        return c.json({ error: "候选人资料查看时间已结束。" }, 410);
      }
      const resume = await dependencies.loadResume({
        candidateId: c.req.param("candidateId"),
        scope: authorization.scope,
      });
      if (!resume) {
        return c.json({ error: "该候选人没有可预览的简历文件。" }, 404);
      }
      const object = await dependencies.getObjectBytes(resume.storageKey);
      if (!object) {
        return c.json({ error: "简历文件已不可用。" }, 404);
      }
      return dependencies.createPptxPreviewPdfResponse({
        bytes: object.bytes,
        cacheKey: resume.storageKey,
        fileName: resume.fileName,
        mediaType: object.contentType,
      });
    });
}

export const humanInterviewCandidateMaterialsRouter =
  createHumanInterviewCandidateMaterialsRouter();
