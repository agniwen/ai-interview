import { createServerFn } from "@tanstack/react-start";
import type { DepartmentRecord } from "@arc/shared/departments";
import type { JsonValue } from "@/lib/start/server-function-types";
import { resolveWorkspaceAccessFromRequest } from "@/lib/start/auth-session.server";
import { emptyFiltersSchema, workspaceDataGridInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioInterviewersData } from "./interviewers.server";

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
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
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
