import { createServerFn } from "@tanstack/react-start";
import { getPlatformAdminStateFromRequest } from "@/lib/start/platform-admin.server";
import { platformDataGridInputSchema } from "@/lib/start/server-fn-validators";
import type { JsonValue } from "@/lib/start/server-function-types";
import { resumeParseCacheFilterSchema } from "@app/server/web/platform";
import { loadPlatformResumeParseCacheHydrationState } from "./resume-parse-cache.server";

export type PlatformResumeParseCacheState =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | {
      dehydratedState: JsonValue;
      status: "ready";
    };

export const loadPlatformResumeParseCacheState = createServerFn({ method: "GET" })
  .validator(platformDataGridInputSchema(resumeParseCacheFilterSchema))
  .handler(async ({ data }): Promise<PlatformResumeParseCacheState> => {
    const adminState = await getPlatformAdminStateFromRequest();
    if (adminState.status !== "ready") {
      return adminState;
    }

    return {
      dehydratedState: await loadPlatformResumeParseCacheHydrationState(data.query),
      status: "ready",
    };
  });
