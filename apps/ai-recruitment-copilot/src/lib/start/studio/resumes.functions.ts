import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { JsonValue } from "@/lib/start/server-function-types";
import { workspaceDataGridInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioResumesStateFromRequest } from "./resumes-state.server";

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

const studioResumesInputSchema = workspaceDataGridInputSchema(resumeFiltersSchema).extend({
  prefetchList: z.boolean(),
});

export type StudioResumesInput = z.infer<typeof studioResumesInputSchema>;

export type StudioResumesServerState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      dehydratedState: JsonValue;
      mode: "list";
      status: "ready";
    }
  | {
      mode: "nested";
      status: "ready";
    };

export type StudioResumesState = StudioResumesServerState;

export const loadStudioResumesState = createServerFn({ method: "GET" })
  .validator(studioResumesInputSchema)
  .handler(
    async ({ data }): Promise<StudioResumesServerState> =>
      await loadStudioResumesStateFromRequest(data),
  );
