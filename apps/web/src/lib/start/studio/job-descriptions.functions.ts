import { createServerFn } from "@tanstack/react-start";
import type { DepartmentListRecord } from "@app/shared/departments";
import type { InterviewerListRecord } from "@app/shared/interviewers";
import { slugInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioJobDescriptionsData } from "./job-descriptions.server";
import { resolveAuthorizedStudioPageAccessFromRequest } from "./page-access.server";

export type StudioJobDescriptionsState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      departments: DepartmentListRecord[];
      interviewers: InterviewerListRecord[];
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
        slug: access.workspace.slug,
      })),
      status: "ready",
    };
  });
