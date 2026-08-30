import { createServerFn } from "@tanstack/react-start";
import { getPlatformAdminStateFromRequest } from "@/lib/start/platform-admin.server";
import { emptyFiltersSchema, platformDataGridInputSchema } from "@/lib/start/server-fn-validators";
import type { JsonValue } from "@/lib/start/server-function-types";
import { loadPlatformUsersHydrationState } from "./users.server";

export type PlatformUsersState =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | {
      dehydratedState: JsonValue;
      status: "ready";
    };

export const loadPlatformUsersState = createServerFn({ method: "GET" })
  .validator(platformDataGridInputSchema(emptyFiltersSchema))
  .handler(async ({ data }): Promise<PlatformUsersState> => {
    const adminState = await getPlatformAdminStateFromRequest();
    if (adminState.status !== "ready") {
      return adminState;
    }

    return {
      dehydratedState: await loadPlatformUsersHydrationState(data.query),
      status: "ready",
    };
  });
