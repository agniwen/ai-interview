import {
  getObjectBytes,
  getObjectStream,
  presignGetObjectUrl,
} from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import {
  generateResumeStructured,
  parseResumeFast,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline";
import { isResumeParseCacheSourceCompatible } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-provider";
import { projectAttachmentToResumeProfile } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-parser-agent";
import {
  getUserAttachment,
  updateParseResultByHash,
  updateStructuredByHash,
} from "@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { createInternalErrorResponse } from "@arc/ai-recruitment-copilot-backend/server/error-handler";
import { resolveJobDescriptionMatchBestEffort } from "@arc/ai-recruitment-copilot-backend/server/routes/interview/match-job-description";
import { listRecruitingJobDescriptions } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { createPptxPreviewPdfResponse } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/utils/pptx-preview";
import { getResumeDocumentKind } from "@arc/shared/resume-documents";

const PREVIEW_SUFFIX = "-preview.pdf";

export const attachmentsRouter = factory
  .createApp()
  .post("/:id/match-job-description", async (c) => {
    const { activeOrg, user } = c.var;
    if (!user || !activeOrg) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const attachment = await getUserAttachment(user.id, activeOrg.id, c.req.param("id"));
    if (!attachment) {
      return c.json({ error: "Not Found" }, 404);
    }

    const cacheCompatible = isResumeParseCacheSourceCompatible(attachment.parsedTextSource);
    let resumeProfile =
      cacheCompatible && attachment.parsedStructured
        ? projectAttachmentToResumeProfile(attachment.parsedStructured)
        : null;
    if (
      !resumeProfile &&
      cacheCompatible &&
      attachment.parsedTextSource !== "aliyun-docmining" &&
      attachment.parsedText?.trim()
    ) {
      const structured = await generateResumeStructured(attachment.parsedText);
      if (attachment.contentHash) {
        await updateStructuredByHash(attachment.contentHash, structured);
      }
      resumeProfile = projectAttachmentToResumeProfile(structured);
    }
    if (!resumeProfile) {
      const object = await getObjectBytes(attachment.storageKey);
      if (object) {
        const fileUrl =
          getResumeDocumentKind({
            fileName: attachment.filename,
            mediaType: object.contentType || attachment.mediaType,
          }) === "pdf"
            ? await presignGetObjectUrl(attachment.storageKey)
            : undefined;
        const parsed = await parseResumeFast({
          bytes: object.bytes,
          fileName: attachment.filename,
          fileUrl,
          mediaType: object.contentType || attachment.mediaType,
        });
        if (attachment.contentHash) {
          await updateParseResultByHash({
            contentHash: attachment.contentHash,
            parsedPageCount: parsed.pageCount,
            parsedStatus: "ready",
            parsedStructured: parsed.structured,
            parsedText: parsed.text,
            parsedTextSource: parsed.textSource,
          });
        }
        resumeProfile = projectAttachmentToResumeProfile(parsed.structured);
      }
    }

    if (!resumeProfile) {
      return c.json({ error: "简历解析缓存不可用，请重新上传简历后再试。" }, 422);
    }

    try {
      const jobDescriptions = await listRecruitingJobDescriptions(activeOrg.id);
      const match = await resolveJobDescriptionMatchBestEffort({
        jobDescriptions,
        resumeProfile,
      });
      return c.json(match, 200);
    } catch (error) {
      return c.json(
        createInternalErrorResponse({
          context: { organizationId: activeOrg.id },
          error,
          operation: "chat-attachment-job-description-match",
          publicMessage: "在招岗位匹配失败。",
        }),
        500,
      );
    }
  })
  .get("/:previewId", async (c, next) => {
    const previewId = c.req.param("previewId");
    if (!previewId.endsWith(PREVIEW_SUFFIX)) {
      return next();
    }

    const { activeOrg, user } = c.var;
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!activeOrg) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = previewId.slice(0, -PREVIEW_SUFFIX.length);
    const attachment = await getUserAttachment(user.id, activeOrg.id, id);
    if (!attachment) {
      return c.json({ error: "Not Found" }, 404);
    }

    const object = await getObjectBytes(attachment.storageKey);
    if (!object) {
      return c.json({ error: "Not Found" }, 404);
    }

    return createPptxPreviewPdfResponse({
      bytes: object.bytes,
      cacheKey: attachment.storageKey,
      fileName: attachment.filename,
      mediaType: object.contentType || attachment.mediaType,
    });
  })
  .get("/:id", async (c) => {
    const { activeOrg, user } = c.var;
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!activeOrg) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = c.req.param("id");
    const attachment = await getUserAttachment(user.id, activeOrg.id, id);
    if (!attachment) {
      return c.json({ error: "Not Found" }, 404);
    }

    const object = await getObjectStream(attachment.storageKey);
    if (!object) {
      return c.json({ error: "Not Found" }, 404);
    }

    return new Response(object.body, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.filename)}"`,
        "Content-Type": object.contentType ?? attachment.mediaType,
        ...(object.contentLength !== undefined && {
          "Content-Length": String(object.contentLength),
        }),
      },
    });
  });
