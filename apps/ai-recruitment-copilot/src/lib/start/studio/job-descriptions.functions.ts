import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { DepartmentRecord } from "@arc/shared/departments";
import type { InterviewerListRecord } from "@arc/shared/interviewers";
import type { JobDescriptionMetrics } from "@arc/shared/job-descriptions";
import type { JsonValue } from "@/lib/start/server-function-types";
import { workspaceDataGridInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioJobDescriptionsData } from "./job-descriptions.server";
import { resolveAuthorizedStudioPageAccessFromRequest } from "./page-access.server";

export interface JobDescriptionFilters extends Record<string, string> {
  departmentId: string;
  interviewerId: string;
}

const jobDescriptionFiltersSchema = z.object({
  departmentId: z.string(),
  interviewerId: z.string(),
});

export type StudioJobDescriptionsState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      departments: DepartmentRecord[];
      dehydratedState: JsonValue;
      interviewers: InterviewerListRecord[];
      metrics: JobDescriptionMetrics;
      status: "ready";
    };

export const loadStudioJobDescriptionsState = createServerFn({ method: "GET" })
  .validator(workspaceDataGridInputSchema(jobDescriptionFiltersSchema))
  .handler(async ({ data }): Promise<StudioJobDescriptionsState> => {
    const access = await resolveAuthorizedStudioPageAccessFromRequest(data.slug, "jobDescriptions");
    if (access.status !== "ready") {
      return access;
    }

    return {
      ...(await loadStudioJobDescriptionsData({
        query: data.query,
        slug: data.slug,
        workspaceId: access.workspace.id,
      })),
      status: "ready",
    };
  });
