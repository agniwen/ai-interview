import {
  externalApplicationFormSchema,
  parseExternalApplicationContact,
} from "@app/shared/external-applications";
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
import { externalApplicationMaterialsRouter } from "./materials-route";
import { submitExternalResume } from "./submit-external-resume";

const submissionSchema = externalApplicationFormSchema.extend({
  requestId: z.uuid({ message: "投递请求标识无效。" }),
});

function readFormText(form: FormData | null, key: string): string {
  const value = form?.get(key);
  if (!value || value instanceof File) {
    return "";
  }
  return value;
}

function parseExternalApplicationSubmissionForm(form: FormData | null) {
  return submissionSchema.safeParse({
    alternateJobDescriptionId: readFormText(form, "alternateJobDescriptionId") || null,
    batch: readFormText(form, "batch"),
    candidateName: readFormText(form, "candidateName"),
    className: readFormText(form, "className"),
    contact: readFormText(form, "contact"),
    jobDescriptionId: readFormText(form, "jobDescriptionId"),
    portfolioContribution: readFormText(form, "portfolioContribution"),
    portfolioUrl: readFormText(form, "portfolioUrl"),
    requestId: readFormText(form, "requestId"),
    trainingInstitution: readFormText(form, "trainingInstitution"),
    workMode: readFormText(form, "workMode"),
  });
}

function validateUploadedResumeFile(form: FormData | null) {
  const file = normalizeResumeFile(form?.get("resume") ?? null);
  if (!file) {
    return { error: "请上传简历文件。" } as const;
  }
  if (!isExternalApplicationResume({ fileName: file.name, mediaType: file.type })) {
    return { error: `仅支持 ${externalApplicationResumeLabel}。` } as const;
  }
  try {
    validateResumeFile(file);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "文件无效。" } as const;
  }
  return { file } as const;
}

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
      maxSize: MAX_RESUME_FILE_SIZE_BYTES + 256 * 1024,
      onError: (c) => c.json({ error: "请求体过大，简历文件不能超过 20 MB。" }, 413),
    }),
    async (c) => {
      const token = c.req.param("token");
      const link = await resolveExternalApplicationLink(token);
      if (!link) {
        return c.json({ error: "投递链接不可用。" }, 404);
      }
      const form = await c.req.formData().catch(() => null);
      const parsed = parseExternalApplicationSubmissionForm(form);
      if (!parsed.success) {
        return c.json({ error: parsed.error.issues[0]?.message ?? "投递参数无效。" }, 400);
      }
      const validatedFile = validateUploadedResumeFile(form);
      if ("error" in validatedFile) {
        return c.json({ error: validatedFile.error }, 400);
      }

      const jobs = await listExternalApplicationJobs(link.organizationId);
      const primaryJob = jobs.find((job) => job.id === parsed.data.jobDescriptionId);
      if (!primaryJob) {
        return c.json({ error: "首选岗位已暂停或不可用，请重新选择。" }, 409);
      }

      const alternateJobId =
        parsed.data.alternateJobDescriptionId &&
        parsed.data.alternateJobDescriptionId !== primaryJob.id
          ? parsed.data.alternateJobDescriptionId
          : null;
      const alternateJob = alternateJobId ? jobs.find((job) => job.id === alternateJobId) : null;
      if (alternateJobId && !alternateJob) {
        return c.json({ error: "备选岗位不可用，请重新选择。" }, 400);
      }

      const contact = parseExternalApplicationContact(parsed.data.contact);
      const result = await submitExternalResume({
        externalApplication: {
          applicationDetails: {
            alternateJobDescriptionId: alternateJob?.id ?? null,
            alternateJobName: alternateJob?.name ?? null,
            batch: parsed.data.batch || null,
            className: parsed.data.className || null,
            contactRaw: contact.contactRaw,
            portfolioContribution: parsed.data.portfolioContribution || null,
            trainingInstitution: parsed.data.trainingInstitution,
            workMode: parsed.data.workMode,
          },
          candidateEmail: contact.email,
          candidateName: parsed.data.candidateName,
          candidatePhone: contact.phone,
          portfolioUrl: parsed.data.portfolioUrl,
          targetRole: primaryJob.name,
        },
        file: validatedFile.file,
        jobDescriptionId: primaryJob.id,
        organizationId: link.organizationId,
        requestId: parsed.data.requestId,
        token,
      });
      return c.json(result.body, result.status);
    },
  )
  .route("/:token/resumes/:requestId/materials", externalApplicationMaterialsRouter);
