import {
  externalApplicationResumeLabel,
  isExternalApplicationResume,
} from "@app/shared/resume-documents";
import { z } from "zod";
import { MAX_RESUME_FILE_SIZE_BYTES } from "@app/shared/bulk-resume-upload";
import { validateResumeFile } from "@app/resume-processing/ingest/agents/resume-analysis-agent";
import { bodyLimit } from "hono/body-limit";
import { factory } from "../../../../factory";
import { normalizeResumeFile } from "../../../interview/utils";
import { listExternalApplicationJobs, resolveExternalApplicationLink } from "./dao";

import { submitExternalResume } from "./submit-external-resume";

const submissionSchema = z.object({
  jobDescriptionId: z.string().max(128).nullable(),
  requestId: z.uuid(),
});

export const externalApplicationsRouter = factory
  .createApp()
  .get("/:token", async (c) => {
    c.header("Cache-Control", "no-store");
    const link = await resolveExternalApplicationLink(c.req.param("token"));
    if (!link) {
      return c.json({ error: "投递链接不可用。" }, 404);
    }
    const jobs = await listExternalApplicationJobs(link.organizationId);
    return c.json({ jobs, workspaceName: link.name }, 200);
  })
  .post(
    "/:token/resumes",
    bodyLimit({
      maxSize: MAX_RESUME_FILE_SIZE_BYTES + 64 * 1024,
      onError: (c) => c.json({ error: "简历文件不能超过 20 MB。" }, 413),
    }),
    async (c) => {
      const token = c.req.param("token");
      const link = await resolveExternalApplicationLink(token);
      if (!link) {
        return c.json({ error: "投递链接不可用。" }, 404);
      }
      const form = await c.req.formData().catch(() => null);
      const file = normalizeResumeFile(form?.get("resume") ?? null);
      const input = submissionSchema.safeParse({
        jobDescriptionId: form?.get("jobDescriptionId") ?? null,
        requestId: form?.get("requestId"),
      });
      if (!input.success) {
        return c.json({ error: "投递参数无效。" }, 400);
      }
      if (!file) {
        return c.json({ error: "请上传简历文件。" }, 400);
      }
      if (!isExternalApplicationResume({ fileName: file.name, mediaType: file.type })) {
        return c.json({ error: `仅支持 ${externalApplicationResumeLabel}。` }, 400);
      }
      try {
        validateResumeFile(file);
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : "文件无效。" }, 400);
      }
      const result = await submitExternalResume({
        file,
        jobDescriptionId: input.data.jobDescriptionId || null,
        organizationId: link.organizationId,
        requestId: input.data.requestId,
        token,
      });
      return c.json(result.body, result.status);
    },
  );
