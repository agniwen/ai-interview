import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { JsonValue } from "@/lib/start/server-function-types";
import { resolveWorkspaceAccessFromRequest } from "@/lib/start/auth-session.server";
import { workspaceDataGridInputSchema } from "@/lib/start/server-fn-validators";
import { resolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import { loadStudioInterviewsHydrationState } from "./interviews.server";

export interface InterviewFilters extends Record<string, string> {
  creatorIds: string;
  status: string;
}

const interviewFiltersSchema = z.object({
  creatorIds: z.string(),
  status: z.string(),
});

export type StudioInterviewsServerState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      dehydratedState: JsonValue;
      status: "ready";
    };

export type StudioInterviewsState =
  | Exclude<StudioInterviewsServerState, { status: "ready" }>
  | {
      dehydratedState: JsonValue;
      isListRoute: boolean;
      status: "ready";
    };

export const loadStudioInterviewsState = createServerFn({ method: "GET" })
  .validator(workspaceDataGridInputSchema(interviewFiltersSchema))
  .handler(async ({ data }): Promise<StudioInterviewsServerState> => {
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
    if (access.status !== "ready") {
      return access;
    }

    const visibilityScope = await resolveRecruitingVisibilityScope({
      currentRole: access.member.role,
      organizationId: access.workspace.id,
      userId: access.user.id,
    });

    return {
      dehydratedState: await loadStudioInterviewsHydrationState({
        query: data.query,
        slug: data.slug,
        visibilityScope,
        workspaceId: access.workspace.id,
      }),
      status: "ready",
    };
  });
