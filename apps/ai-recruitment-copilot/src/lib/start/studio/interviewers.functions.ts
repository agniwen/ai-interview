import { createServerFn } from "@tanstack/react-start";
import type { DepartmentRecord } from "@arc/shared/departments";
import type { JsonValue } from "@/lib/start/server-function-types";
import { emptyFiltersSchema, workspaceDataGridInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioInterviewersData } from "./interviewers.server";
import { resolveAuthorizedStudioPageAccessFromRequest } from "./page-access.server";

export type StudioInterviewersState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      departments: DepartmentRecord[];
      dehydratedState: JsonValue;
      status: "ready";
    };

export const loadStudioInterviewersState = createServerFn({ method: "GET" })
  .validator(workspaceDataGridInputSchema(emptyFiltersSchema))
  .handler(async ({ data }): Promise<StudioInterviewersState> => {
    const access = await resolveAuthorizedStudioPageAccessFromRequest(data.slug, "interviewers");
    if (access.status !== "ready") {
      return access;
    }

    return {
      ...(await loadStudioInterviewersData({
        query: data.query,
        slug: data.slug,
        workspaceId: access.workspace.id,
      })),
      status: "ready",
    };
  });
