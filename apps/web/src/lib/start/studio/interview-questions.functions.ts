import { createServerFn } from "@tanstack/react-start";
import type { JobDescriptionListRecord } from "@app/shared/job-descriptions";
import { slugInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioInterviewQuestionsData } from "./interview-questions.server";
import { resolveAuthorizedStudioPageAccessFromRequest } from "./page-access.server";

export type StudioInterviewQuestionsState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      jobDescriptions: JobDescriptionListRecord[];
      status: "ready";
    };

export const loadStudioInterviewQuestionsState = createServerFn({ method: "GET" })
  .validator(slugInputSchema)
  .handler(async ({ data }): Promise<StudioInterviewQuestionsState> => {
    const access = await resolveAuthorizedStudioPageAccessFromRequest(
      data.slug,
      "interviewQuestions",
    );
    if (access.status !== "ready") {
      return access;
    }

    return {
      ...(await loadStudioInterviewQuestionsData({
        slug: access.workspace.slug,
      })),
      status: "ready",
    };
  });
