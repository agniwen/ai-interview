import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ResumeLibraryMetrics } from "@arc/shared/studio-resumes";
import type { JsonValue } from "@/lib/start/server-function-types";
import { resolveWorkspaceAccessFromRequest } from "@/lib/start/auth-session.server";
import { workspaceDataGridInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioResumesData } from "./resumes.server";

export interface ResumeFilters extends Record<string, string> {
  creatorIds: string;
  skills: string;
  jdIds: string;
  stage: string;
}

const resumeFiltersSchema = z.object({
  creatorIds: z.string(),
  jdIds: z.string(),
  skills: z.string(),
  stage: z.string(),
});

export type StudioResumesState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      dehydratedState: JsonValue;
      metrics: ResumeLibraryMetrics;
      status: "ready";
    };

export const loadStudioResumesState = createServerFn({ method: "GET" })
  .validator(workspaceDataGridInputSchema(resumeFiltersSchema))
  .handler(async ({ data }): Promise<StudioResumesState> => {
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
    if (access.status !== "ready") {
      return access;
    }

    return {
      ...(await loadStudioResumesData({
        query: data.query,
        slug: data.slug,
        userId: access.user.id,
        userRole: access.member.role,
        workspaceId: access.workspace.id,
      })),
      status: "ready",
    };
  });
