import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import type { JsonValue } from "@/lib/start/server-function-types";
import { resolveWorkspaceAccessFromRequest } from "@/lib/start/auth-session.server";
import { workspaceDataGridInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioFormsData } from "./forms.server";

export interface CandidateFormFilters extends Record<string, string> {
  archivedFilter: string;
  jobDescriptionId: string;
  scope: string;
}

const candidateFormFiltersSchema = z.object({
  archivedFilter: z.string(),
  jobDescriptionId: z.string(),
  scope: z.string(),
});

export type StudioFormsState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      dehydratedState: JsonValue;
      jobDescriptions: JobDescriptionListRecord[];
      status: "ready";
    };

export const loadStudioFormsState = createServerFn({ method: "GET" })
  .validator(workspaceDataGridInputSchema(candidateFormFiltersSchema))
  .handler(async ({ data }): Promise<StudioFormsState> => {
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
    if (access.status !== "ready") {
      return access;
    }

    return {
      ...(await loadStudioFormsData({
        query: data.query,
        slug: data.slug,
        workspaceId: access.workspace.id,
      })),
      status: "ready",
    };
  });
