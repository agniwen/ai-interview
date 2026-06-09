import { createServerFn } from "@tanstack/react-start";
import type { GlobalConfigRecord } from "@arc/shared/global-config";
import { resolveWorkspaceAccessFromRequest } from "@/lib/start/auth-session.server";
import { slugInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioGlobalConfigInitial } from "./global-config.server";

export type StudioGlobalConfigState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      initial: GlobalConfigRecord;
      status: "ready";
    };

export const loadStudioGlobalConfigState = createServerFn({ method: "GET" })
  .validator(slugInputSchema)
  .handler(async ({ data }): Promise<StudioGlobalConfigState> => {
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
    if (access.status !== "ready") {
      return access;
    }

    return {
      initial: await loadStudioGlobalConfigInitial(access.workspace.id),
      status: "ready",
    };
  });
