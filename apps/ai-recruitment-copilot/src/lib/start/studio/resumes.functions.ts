import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ResumeLibraryMetrics } from "@arc/shared/studio-resumes";
import type { JsonValue } from "@/lib/start/server-function-types";
import {
  resolveWorkspaceAccessFromRequest,
  workspaceAccessHasPermission,
} from "@/lib/start/auth-session.server";
import { workspaceDataGridInputSchema } from "@/lib/start/server-fn-validators";
import { resolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
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

export type StudioResumesServerState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      dehydratedState: JsonValue;
      metrics: ResumeLibraryMetrics;
      status: "ready";
    };

export type StudioResumesState = StudioResumesServerState;

export const loadStudioResumesState = createServerFn({ method: "GET" })
  .validator(
    workspaceDataGridInputSchema(resumeFiltersSchema).extend({ prefetchList: z.boolean() }),
  )
  .handler(async ({ data }): Promise<StudioResumesServerState> => {
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
    if (access.status !== "ready") {
      return access;
    }
    const canReadResumes = await workspaceAccessHasPermission({
      access,
      action: "read",
      resource: "resumeLibrary",
    });
    if (!canReadResumes) {
      return { status: "not_found" };
    }
    const visibilityScope = data.prefetchList
      ? await resolveRecruitingVisibilityScope({
          currentRole: access.member.role,
          organizationId: access.workspace.id,
          userId: access.user.id,
        })
      : undefined;

    return {
      ...(await loadStudioResumesData({
        prefetchList: data.prefetchList,
        query: data.query,
        slug: data.slug,
        visibilityScope,
        workspaceId: access.workspace.id,
      })),
      status: "ready",
    };
  });
