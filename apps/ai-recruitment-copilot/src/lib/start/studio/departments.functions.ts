import { createServerFn } from "@tanstack/react-start";
import type { JsonValue } from "@/lib/start/server-function-types";
import { resolveWorkspaceAccessFromRequest } from "@/lib/start/auth-session.server";
import { emptyFiltersSchema, workspaceDataGridInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioDepartmentsHydrationState } from "./departments.server";

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
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
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
