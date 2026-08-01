import { createServerFn } from "@tanstack/react-start";
import type { JsonValue } from "@/lib/start/server-function-types";
import { emptyFiltersSchema, workspaceDataGridInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioDepartmentsHydrationState } from "./departments.server";
import { resolveAuthorizedStudioPageAccessFromRequest } from "./page-access.server";

export type StudioDepartmentsState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      dehydratedState: JsonValue;
      status: "ready";
    };

export const loadStudioDepartmentsState = createServerFn({ method: "GET" })
  .validator(workspaceDataGridInputSchema(emptyFiltersSchema))
  .handler(async ({ data }): Promise<StudioDepartmentsState> => {
    const access = await resolveAuthorizedStudioPageAccessFromRequest(data.slug, "departments");
    if (access.status !== "ready") {
      return access;
    }

    return {
      dehydratedState: await loadStudioDepartmentsHydrationState({
        query: data.query,
        slug: data.slug,
        workspaceId: access.workspace.id,
      }),
      status: "ready",
    };
  });
