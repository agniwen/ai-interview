import { createServerFn } from "@tanstack/react-start";
import type { JobDescriptionListRecord } from "@app/shared/job-descriptions";
import { slugInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioFormsData } from "./forms.server";
import { resolveAuthorizedStudioPageAccessFromRequest } from "./page-access.server";

export type StudioFormsState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      jobDescriptions: JobDescriptionListRecord[];
      status: "ready";
    };

export const loadStudioFormsState = createServerFn({ method: "GET" })
  .validator(slugInputSchema)
  .handler(async ({ data }): Promise<StudioFormsState> => {
    const access = await resolveAuthorizedStudioPageAccessFromRequest(data.slug, "forms");
    if (access.status !== "ready") {
      return access;
    }

    return {
      ...(await loadStudioFormsData({
        workspaceId: access.workspace.id,
      })),
      status: "ready",
    };
  });
