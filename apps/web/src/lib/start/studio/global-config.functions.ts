import { createServerFn } from "@tanstack/react-start";
import type { GlobalConfigRecord } from "@app/shared/global-config";
import { slugInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioGlobalConfigInitial } from "./global-config.server";
import { resolveAuthorizedStudioPageAccessFromRequest } from "./page-access.server";

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
    const access = await resolveAuthorizedStudioPageAccessFromRequest(data.slug, "globalConfig");
    if (access.status !== "ready") {
      return access;
    }

    return {
      initial: await loadStudioGlobalConfigInitial(access.workspace.slug),
      status: "ready",
    };
  });
