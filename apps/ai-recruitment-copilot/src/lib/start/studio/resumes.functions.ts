import { createServerFn } from "@tanstack/react-start";
import { slugInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioResumesStateFromRequest } from "./resumes-state.server";

export interface StudioResumesInput {
  slug: string;
}
export type StudioResumesServerState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "ready" };

export type StudioResumesState = StudioResumesServerState;

export const loadStudioResumesState = createServerFn({ method: "GET" })
  .validator(slugInputSchema)
  .handler(
    async ({ data }): Promise<StudioResumesServerState> =>
      await loadStudioResumesStateFromRequest(data),
  );
