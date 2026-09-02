import { createServerFn } from "@tanstack/react-start";
import type { DepartmentRecord } from "@app/shared/departments";
import type { InterviewerListRecord } from "@app/shared/interviewers";
import type { JobDescriptionMetrics } from "@app/shared/job-descriptions";
import { slugInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioJobDescriptionsData } from "./job-descriptions.server";
import { resolveAuthorizedStudioPageAccessFromRequest } from "./page-access.server";

export type StudioJobDescriptionsState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      departments: DepartmentRecord[];
      interviewers: InterviewerListRecord[];
      metrics: JobDescriptionMetrics;
      status: "ready";
    };

export const loadStudioJobDescriptionsState = createServerFn({ method: "GET" })
  .validator(slugInputSchema)
  .handler(async ({ data }): Promise<StudioJobDescriptionsState> => {
    const access = await resolveAuthorizedStudioPageAccessFromRequest(data.slug, "jobDescriptions");
    if (access.status !== "ready") {
      return access;
    }

    return {
      ...(await loadStudioJobDescriptionsData({
        workspaceId: access.workspace.id,
      })),
      status: "ready",
    };
  });
